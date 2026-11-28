import { planStoreChanges, type RecordChange } from "./changes";
import type { DeviceRecordStore, KeyValue } from "./device-record-store";
import type { RecordMap } from "./records";
import {
  composeEnvelope,
  decomposeStore,
  envelopeState,
  type RecordStoreKey,
  STORE_SHAPES,
  storeOfType,
} from "./store-records";
import {
  emptySyncState,
  type QuarantineNote,
  recordLocalChanges,
  type SyncState,
} from "./sync-state";

/**
 * 화면 store ↔ 기기 레코드 ↔ 동기화 상태를 잇는 층. 저장소 모드·플랫폼과 상관없이 같은 길이다:
 *
 *   store 저장 → decompose → 바뀐 레코드만 기기에 (패치) → (cloud) 실제로 바뀐 것을 outbox 에
 *   pull·push 결과 → 기기 레코드 → 바뀐 store 를 다시 읽게 알림
 *
 * 기기 레코드와 동기화 상태를 읽고 쓰는 일은 모두 잠금 하나 안에서 차례로 한다 (앱 SQLite 는 비동기라
 * 저장과 pull 반영이 섞이면 서로의 결과를 덮는다).
 */

export const SYNC_STATE_KEY = "seedbook.sync.v2";
export const QUARANTINE_KEY = "seedbook.sync.v2.quarantine";
/** 격리 기록은 진단용이라 최근 것만 둔다. */
const MAX_QUARANTINE = 100;

export interface RecordLayerDeps {
  /** 계정 자리의 기기 레코드 저장소. */
  store: () => DeviceRecordStore;
  /** 계정 자리의 작은 값 (동기화 상태·격리 기록). */
  kv: KeyValue & { removeItem(key: string): void };
  isCloud: () => boolean;
  now?: () => string;
}

interface QuarantineLog {
  entries: QuarantineNote[];
  /** 사용자가 저장 위치 화면에서 본 시각 — 그 뒤 생긴 격리만 홈에 알린다. */
  seenAt: string | null;
}

export type RecordLayer = ReturnType<typeof createRecordLayer>;

export function createRecordLayer(deps: RecordLayerDeps) {
  const now = deps.now ?? (() => new Date().toISOString());
  let chain: Promise<unknown> = Promise.resolve();
  const pendingLinks = new Map<string, string | null>();
  const localListeners = new Set<() => void>();
  const remoteListeners = new Set<(stores: RecordStoreKey[]) => void>();
  const quarantineListeners = new Set<() => void>();

  /** 차례로 실행한다. 앞 작업이 실패해도 다음 작업은 돈다. */
  function withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(fn, fn);
    chain = run.catch(() => undefined);
    return run;
  }

  function loadState(): SyncState {
    try {
      const raw = deps.kv.getItem(SYNC_STATE_KEY);
      const parsed = raw ? (JSON.parse(raw) as SyncState) : null;
      if (parsed?.v === 2 && parsed.outbox && parsed.shadow) return parsed;
    } catch {
      // 읽을 수 없으면 처음부터 (서버 전체 pull 이 다시 맞춘다).
    }
    return emptySyncState(now());
  }

  function saveState(state: SyncState) {
    deps.kv.setItem(SYNC_STATE_KEY, JSON.stringify(state));
  }

  function readQuarantine(): QuarantineLog {
    try {
      const raw = deps.kv.getItem(QUARANTINE_KEY);
      const parsed = raw ? (JSON.parse(raw) as QuarantineLog) : null;
      if (parsed && Array.isArray(parsed.entries)) return parsed;
    } catch {
      // 진단용 기록이라 읽지 못하면 새로 시작한다.
    }
    return { entries: [], seenAt: null };
  }

  function addQuarantine(notes: Omit<QuarantineNote, "at">[]) {
    if (notes.length === 0) return;
    const at = now();
    const log = readQuarantine();
    const entries = [...log.entries, ...notes.map((n) => ({ ...n, at }))].slice(-MAX_QUARANTINE);
    try {
      deps.kv.setItem(QUARANTINE_KEY, JSON.stringify({ ...log, entries }));
    } catch {
      // 기록 실패는 동기화를 막지 않는다.
    }
    // 값은 남기지 않는다 (진단 로그는 건수·코드만).
    console.warn(
      "[sync] 저장·전송하지 못한 값을 격리했다",
      notes.map((n) => `${n.type}.${n.field}:${n.code}`)
    );
    quarantineListeners.forEach((listener) => listener());
  }

  function storesOf(changes: RecordChange[]): RecordStoreKey[] {
    const keys = new Set<RecordStoreKey>();
    for (const change of changes) {
      const key = storeOfType(change.type);
      if (key) keys.add(key);
    }
    return [...keys];
  }

  return {
    withLock,
    loadState,
    saveState,
    /** 지금까지 들어온 저장·반영이 모두 끝날 때까지 기다린다. */
    idle: () => withLock(async () => undefined),

    /** store 의 persist envelope (레코드에서 만든다). 저장한 적이 없으면 null. */
    readStore(key: RecordStoreKey): Promise<string | null> {
      return withLock(async () => {
        const store = deps.store();
        const types = STORE_SHAPES[key].types;
        if (!(await store.everStored(types))) return null;
        return composeEnvelope(key, await store.load());
      });
    },

    /** store 의 persist envelope 를 레코드로 저장한다 (cloud 면 바뀐 것을 outbox 에). */
    saveStore(key: RecordStoreKey, envelope: string): Promise<void> {
      return withLock(async () => {
        const state = envelopeState(envelope);
        if (!state) return;
        const store = deps.store();
        const before = await store.load();
        const plan = decomposeStore(key, state, before);
        if (!plan) return;
        addQuarantine(
          plan.invalid.map((item) => ({
            type: item.type,
            id: item.id,
            field: "*",
            code: "invalid",
            value: item.value,
          }))
        );
        const changes = planStoreChanges(key, plan, before, pendingLinks);
        if (changes.length === 0) return;
        await commitLocal(store, before, changes);
      });
    },

    /**
     * 지금 기기 레코드로 변경을 계산해 저장한다 (백업 불러오기 등). cloud 면 outbox 에 기록한다.
     */
    commit(plan: (current: RecordMap) => RecordChange[]): Promise<void> {
      return withLock(async () => {
        const store = deps.store();
        const before = await store.load();
        const changes = plan(before);
        if (changes.length > 0) await commitLocal(store, before, changes);
      });
    },

    /**
     * 동기화 결과를 반영한다: 기기 레코드·동기화 상태를 읽어 `fn` 으로 다음 상태를 계산하고 저장한다.
     * 바뀐 store 에 알린다. 잠금 안에서 돈다.
     */
    applySync<T>(
      fn: (
        local: RecordMap,
        state: SyncState
      ) => {
        state: SyncState;
        changes: RecordChange[];
        quarantine?: Omit<QuarantineNote, "at">[];
        result: T;
      }
    ): Promise<T> {
      return withLock(async () => {
        const store = deps.store();
        const local = await store.load();
        const out = fn(local, loadState());
        if (out.changes.length > 0) addQuarantine((await store.apply(out.changes)).quarantined);
        saveState(out.state);
        addQuarantine(out.quarantine ?? []);
        const stores = storesOf(out.changes);
        if (stores.length > 0) remoteListeners.forEach((listener) => listener(stores));
        return out.result;
      });
    },

    /** 기기 레코드 (잠금 안에서 읽는다). */
    loadRecords(): Promise<RecordMap> {
      return withLock(() => deps.store().load());
    },

    clearSyncState() {
      deps.kv.removeItem(SYNC_STATE_KEY);
    },

    addQuarantine,
    hasUnseenQuarantine(): boolean {
      const log = readQuarantine();
      return log.entries.some((e) => log.seenAt === null || e.at > log.seenAt);
    },
    markQuarantineSeen() {
      const log = readQuarantine();
      if (log.entries.length === 0) return;
      deps.kv.setItem(QUARANTINE_KEY, JSON.stringify({ ...log, seenAt: now() }));
      quarantineListeners.forEach((listener) => listener());
    },

    onLocalChange(listener: () => void) {
      localListeners.add(listener);
      return () => localListeners.delete(listener);
    },
    onRemoteChange(listener: (stores: RecordStoreKey[]) => void) {
      remoteListeners.add(listener);
      return () => remoteListeners.delete(listener);
    },
    onQuarantine(listener: () => void) {
      quarantineListeners.add(listener);
      return () => quarantineListeners.delete(listener);
    },
  };

  async function commitLocal(store: DeviceRecordStore, before: RecordMap, changes: RecordChange[]) {
    const { quarantined } = await store.apply(changes);
    addQuarantine(quarantined);
    if (!deps.isCloud()) return;
    // 실제로 저장된 결과(정의의 normalize 를 거친 값)를 비교한다 — 기기 검증에 걸려 쓰지 않은 값은
    // 보내지 않는다.
    const after = await store.load();
    const state = loadState();
    const next = recordLocalChanges(state, before, after);
    if (next !== state) {
      saveState(next);
      localListeners.forEach((listener) => listener());
    }
  }
}
