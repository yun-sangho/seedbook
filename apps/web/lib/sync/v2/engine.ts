import {
  DEFAULT_PULL_LIMIT,
  type PulledRecord,
  type PullResponse,
  type PushResponse,
  SCHEMA_VERSION,
  SYNC_HEADERS,
  SYNC_PROTOCOL,
} from "@seedbook/domain";
import type { RecordLayer } from "./record-layer";
import { applyPulled, applyPushResults, nextPushBatch } from "./sync-state";

/**
 * 동기화 v2 엔진 (설계 §4·§5.2). 프레임워크와 무관하다 — 화면·브라우저 이벤트는 호출하는 쪽이
 * `notifyLocalChange`·`resume`·`online` 으로 알려 준다.
 *
 * - push: outbox 를 200 ops·1MB 씩 나눠 보낸다 (부모 먼저). 결과로 섀도·격리·되돌림을 반영한다.
 * - pull: 커서부터 끝까지 받아 한 번에 반영한다. 커서가 없거나 서버가 `reset` 이면 전체를 다시 받는다.
 * - 요청 제한 시간 15초. 네트워크 오류·5xx 는 지수 backoff (1초 → 60초, 지터) 로 다시 시도한다.
 * - 401 (로그인 필요)·426 (앱 업데이트 필요)·409 (서버가 앱보다 옛 버전) 이면 멈춘다. 편집은 계속 기기에
 *   저장되고 outbox 에 쌓인다. 앱 복귀·온라인 때 다시 확인한다.
 */

export type StoppedReason = "unauthenticated" | "update_required" | "server_behind";

export interface SyncStatus {
  /** 마지막으로 push·pull 을 모두 마친 시각. */
  lastSuccessAt: string | null;
  /** 동기화 상태를 만든 시각 (한 번도 성공하지 못했을 때 기준). */
  startedAt: string;
  stoppedReason: StoppedReason | null;
  /** 아직 보지 않은 격리 (저장·전송하지 못한 값). */
  hasQuarantine: boolean;
}

export type SyncOutcome = "ok" | "retry" | "stopped";

export interface SyncEngineOptions {
  layer: RecordLayer;
  /** 요청 함수 (앱은 `accountFetch`). */
  fetchFn: typeof fetch;
  /** 앱 번들 버전 (로그용 `x-seedbook-client`). */
  client: string;
  schemaVersion?: number;
  pushUrl?: string;
  pullUrl?: string;
  timeoutMs?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  debounceMs?: number;
  random?: () => number;
  now?: () => string;
  onStatus?: (status: SyncStatus) => void;
}

export const SYNC_TIMEOUT_MS = 15_000;
export const RETRY_BASE_MS = 1_000;
export const RETRY_MAX_MS = 60_000;
const DEBOUNCE_MS = 1_000;
/** 한 번의 동기화에서 push 를 이어 보내는 최대 횟수 (서버가 같은 결과를 되풀이해도 끝나게). */
const MAX_PUSH_ROUNDS = 50;

type Response_<T> =
  | { kind: "ok"; body: T }
  | { kind: "retry" }
  | { kind: "stopped"; reason: StoppedReason };

export type SyncEngine = ReturnType<typeof createSyncEngine>;

export function createSyncEngine(options: SyncEngineOptions) {
  const {
    layer,
    client,
    schemaVersion = SCHEMA_VERSION,
    pushUrl = "/api/sync/v2/push",
    pullUrl = "/api/sync/v2/pull",
    timeoutMs = SYNC_TIMEOUT_MS,
    baseDelayMs = RETRY_BASE_MS,
    maxDelayMs = RETRY_MAX_MS,
    debounceMs = DEBOUNCE_MS,
    random = Math.random,
    now = () => new Date().toISOString(),
  } = options;

  let stoppedReason: StoppedReason | null = null;
  let running: Promise<SyncOutcome> | null = null;
  let again = false;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let active = false;

  function status(): SyncStatus {
    const state = layer.loadState();
    return {
      lastSuccessAt: state.lastSuccessAt,
      startedAt: state.startedAt,
      stoppedReason,
      hasQuarantine: layer.hasUnseenQuarantine(),
    };
  }

  const emit = () => options.onStatus?.(status());

  async function request<T>(url: string, init: RequestInit = {}): Promise<Response_<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await options.fetchFn(url, {
        ...init,
        credentials: "include",
        signal: controller.signal,
        headers: {
          ...(init.body ? { "content-type": "application/json" } : {}),
          [SYNC_HEADERS.protocol]: String(SYNC_PROTOCOL),
          [SYNC_HEADERS.schema]: String(schemaVersion),
          [SYNC_HEADERS.client]: client,
        },
      });
      if (res.status === 401) return { kind: "stopped", reason: "unauthenticated" };
      if (res.status === 426) return { kind: "stopped", reason: "update_required" };
      if (res.status === 409) return { kind: "stopped", reason: "server_behind" };
      if (!res.ok) {
        console.warn(`[sync] ${url} ${res.status}`);
        return { kind: "retry" };
      }
      return { kind: "ok", body: (await res.json()) as T };
    } catch (error) {
      console.info("[sync] request failed", url, error);
      return { kind: "retry" };
    } finally {
      clearTimeout(timer);
    }
  }

  async function push(): Promise<SyncOutcome> {
    for (let round = 0; round < MAX_PUSH_ROUNDS; round += 1) {
      const batch = nextPushBatch(layer.loadState());
      if (batch.length === 0) return "ok";
      const res = await request<PushResponse>(pushUrl, {
        method: "POST",
        body: JSON.stringify({ ops: batch.map((b) => b.op) }),
      });
      if (res.kind !== "ok") return outcomeOf(res);
      const results = Array.isArray(res.body?.results) ? res.body.results : [];
      if (results.length === 0) return "retry";
      await layer.applySync((local, state) => ({
        ...applyPushResults(state, batch, results, local),
        result: undefined,
      }));
    }
    return "retry";
  }

  /** 커서부터 끝까지 받는다. 반영하지 않는다. */
  async function fetchChanges(
    start: string | null
  ): Promise<
    | { kind: "ok"; records: PulledRecord[]; cursor: string; full: boolean }
    | { kind: Exclude<SyncOutcome, "ok"> }
  > {
    let full = start === null;
    let cursor = start;
    const records: PulledRecord[] = [];
    for (;;) {
      const params = new URLSearchParams({ limit: String(DEFAULT_PULL_LIMIT) });
      if (cursor) params.set("cursor", cursor);
      const res = await request<PullResponse>(`${pullUrl}?${params}`);
      if (res.kind !== "ok") return { kind: outcomeOf(res) as Exclude<SyncOutcome, "ok"> };
      const page = res.body;
      if (page.reset && !full) {
        // 서버가 데이터를 다시 만들었다 — 처음부터 받은 것이다 (outbox 는 남긴다).
        full = true;
        records.length = 0;
      }
      records.push(...page.records);
      cursor = page.cursor;
      if (!page.hasMore) return { kind: "ok", records, cursor, full };
    }
  }

  async function pull(): Promise<SyncOutcome> {
    const fetched = await fetchChanges(layer.loadState().cursor);
    if (fetched.kind !== "ok") return fetched.kind;
    const { records, cursor, full } = fetched;
    await layer.applySync((local, state) => ({
      ...applyPulled(state, records, local, { full, cursor }),
      result: undefined,
    }));
    return "ok";
  }

  function outcomeOf(res: Exclude<Response_<unknown>, { kind: "ok" }>): SyncOutcome {
    if (res.kind === "stopped") {
      stoppedReason = res.reason;
      return "stopped";
    }
    return "retry";
  }

  async function runOnce(): Promise<SyncOutcome> {
    let outcome = await push();
    if (outcome === "ok") outcome = await pull();
    // 전체 pull 이 서버에 없는 레코드를 outbox 에 넣었을 수 있다.
    if (outcome === "ok" && Object.keys(layer.loadState().outbox).length > 0)
      outcome = await push();
    if (outcome === "ok") {
      stoppedReason = null;
      const at = now();
      await layer.applySync((_local, state) => ({
        state: { ...state, lastSuccessAt: at },
        changes: [],
        result: undefined,
      }));
    }
    return outcome;
  }

  function scheduleRetry() {
    if (!active || retryTimer) return;
    const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
    const delay = Math.round(exponential * (0.5 + random() / 2));
    attempt += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void sync();
    }, delay);
  }

  /** push → pull. 이미 도는 중이면 끝난 뒤 한 번 더 돈다. */
  function sync(): Promise<SyncOutcome> {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      let outcome: SyncOutcome;
      do {
        again = false;
        outcome = await runOnce();
      } while (again && outcome === "ok");
      if (outcome === "ok") attempt = 0;
      if (outcome === "retry") scheduleRetry();
      emit();
      return outcome;
    })().finally(() => {
      running = null;
    });
    return running;
  }

  /** 기다리던 재시도를 버리고 바로 다시 시도한다 (앱 복귀·온라인). */
  function syncNow(): Promise<SyncOutcome> {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    attempt = 0;
    return sync();
  }

  return {
    sync,
    push,
    pull,
    status,
    /** 서버의 살아 있는 레코드 전부 (반영하지 않는다 — 모드 전환 병합용). */
    async fetchServerRecords(): Promise<PulledRecord[] | SyncOutcome> {
      const fetched = await fetchChanges(null);
      return fetched.kind === "ok" ? fetched.records : fetched.kind;
    },
    /** 동기화를 켠다 (자동 재시도·변경 알림). */
    start(): Promise<SyncOutcome> {
      active = true;
      emit();
      return syncNow();
    },
    stop() {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      if (debounceTimer) clearTimeout(debounceTimer);
      retryTimer = null;
      debounceTimer = null;
    },
    /** 로컬 변경이 outbox 에 기록됐다 — 잠시 모아서 보낸다. */
    notifyLocalChange() {
      if (!active) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        // 멈춘 이유가 업데이트·서버 버전이면 편집만으로는 풀리지 않는다 — 복귀·온라인 때 다시 본다.
        if (stoppedReason === "update_required" || stoppedReason === "server_behind") return;
        void sync();
      }, debounceMs);
    },
    resume: () => (active ? syncNow() : Promise.resolve<SyncOutcome>("stopped")),
    online: () => (active ? syncNow() : Promise.resolve<SyncOutcome>("stopped")),
    emitStatus: emit,
  };
}
