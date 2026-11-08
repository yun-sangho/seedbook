import { useSyncStatusStore } from "@web/features/settings/stores/sync-status-store";
import {
  applyMutationResults,
  applyRemoteEntities,
  buildMutations,
  emptySyncMeta,
  mergePull,
  recordLocalChange,
  type MutationResult,
  type SyncedEntity,
  type SyncMeta,
} from "./entity-sync-core";
import type { ManagedStoreConfig } from "./managed-store-config";

/** 서버 `MAX_MUTATIONS` 와 같은 값. 더 많으면 나눠 보낸다. */
const MAX_MUTATIONS_PER_REQUEST = 100;
const DEFAULT_DEBOUNCE_MS = 1_000;

/** store 와 엔진 사이의 최소 접점 — Zustand store 를 감싸 넘긴다. */
export type SyncedStoreBinding<T> = {
  get: () => T[];
  set: (items: T[]) => void;
  subscribe: (listener: (next: T[], prev: T[]) => void) => () => void;
};

export type EntitySyncHandle = {
  pull: () => Promise<void>;
  flush: (options?: { keepalive?: boolean }) => Promise<void>;
  stop: () => void;
};

type StoredMeta = { userId: string; meta: SyncMeta };

type PullResponse = {
  cursor: string | null;
  changes: Record<string, unknown> & { listOrder?: Array<{ domain: string; order: string[] }> };
};

export function readSyncMeta(metaKey: string): StoredMeta | null {
  try {
    const raw = window.localStorage.getItem(metaKey);
    return raw ? (JSON.parse(raw) as StoredMeta) : null;
  } catch {
    return null;
  }
}

export function writeSyncMeta(metaKey: string, stored: StoredMeta): void {
  try {
    window.localStorage.setItem(metaKey, JSON.stringify(stored));
  } catch {
    // quota / private mode — 다음 pull 이 서버 기준으로 다시 맞춘다.
  }
}

/**
 * 첫 pull (`cursor` 가 없을 때) 은 서버를 기준으로 목록을 새로 만든다. 로컬에서 아직
 * 보내지 않은 엔티티만 남긴다 — 그 밖의 로컬 항목은 서버에서 지워졌을 수 있다.
 */
export function mergePullResponse<T extends { id: string }>(
  config: ManagedStoreConfig<T>,
  items: T[],
  meta: SyncMeta,
  response: PullResponse
): { items: T[]; meta: SyncMeta } {
  const full = meta.cursor === null;
  const base = full ? items.filter((i) => meta.outbox[i.id]) : items;
  const baseMeta = full
    ? {
        ...meta,
        versions: Object.fromEntries(
          Object.entries(meta.versions).filter(([id]) => meta.outbox[id])
        ),
      }
    : meta;
  const entities = (response.changes[config.entity] as SyncedEntity[] | undefined) ?? [];
  const order =
    response.changes.listOrder?.find((l) => l.domain === config.listOrderDomain)?.order ?? null;
  return mergePull(base, baseMeta, { cursor: response.cursor, entities, order }, config.fromData);
}

/**
 * 한 store 의 엔티티 동기화를 시작한다:
 *   - store 변경 → outbox 기록 (localStorage) → debounce 후 `/api/sync/mutations`
 *   - 시작 / 창 포커스 / 다시 보일 때 → `/api/sync/pull`
 *   - 숨겨질 때 → keepalive 로 남은 outbox 전송
 *
 * outbox 는 매번 localStorage 에서 읽고 쓴다 — 같은 브라우저의 다른 탭과 큐를 공유한다.
 */
export function startEntitySync<T extends { id: string }>(
  config: ManagedStoreConfig<T>,
  store: SyncedStoreBinding<T>,
  options: { userId: string; fetchFn?: typeof fetch; debounceMs?: number }
): EntitySyncHandle {
  const fetchFn = options.fetchFn ?? ((...args) => fetch(...args));
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const statusKey = `sync:${config.entity}`;
  const status = () => useSyncStatusStore.getState();

  // 다른 사용자의 큐/커서는 버리고 서버에서 다시 받는다.
  const loadMeta = (): SyncMeta => {
    const stored = readSyncMeta(config.metaKey);
    return stored && stored.userId === options.userId ? stored.meta : emptySyncMeta();
  };
  const saveMeta = (meta: SyncMeta) =>
    writeSyncMeta(config.metaKey, { userId: options.userId, meta });
  saveMeta(loadMeta());

  let stopped = false;
  let applyingRemote = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;

  const setItemsFromRemote = (items: T[]) => {
    applyingRemote = true;
    try {
      store.set(items);
    } finally {
      applyingRemote = false;
    }
  };

  const scheduleFlush = () => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, debounceMs);
  };

  const unsubscribe = store.subscribe((next, prev) => {
    if (applyingRemote || next === prev) return;
    saveMeta(recordLocalChange(loadMeta(), prev, next, config.toData));
    scheduleFlush();
  });

  async function sendOnce(keepalive: boolean): Promise<boolean> {
    const { mutations, sent } = buildMutations(loadMeta(), config.entity, config.listOrderDomain);
    if (mutations.length === 0) return false;
    const batch = mutations.slice(0, MAX_MUTATIONS_PER_REQUEST);
    const batchSent = sent.slice(0, MAX_MUTATIONS_PER_REQUEST);

    status().markSaving(statusKey);
    let res: Response;
    try {
      res = await fetchFn("/api/sync/mutations", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mutations: batch }),
        keepalive,
      });
    } catch {
      status().markOffline(statusKey);
      return false;
    }
    if (res.status === 401) {
      status().markUnauthenticated();
      return false;
    }
    if (!res.ok) {
      status().markError(statusKey, `sync ${res.status}`);
      return false;
    }
    const { results } = (await res.json()) as { results: MutationResult[] };
    const applied = applyMutationResults(loadMeta(), batchSent, results);
    saveMeta(applied.meta);
    if (applied.remote.length > 0) {
      setItemsFromRemote(applyRemoteEntities(store.get(), applied.remote, config.fromData));
    }
    status().markSaved(statusKey);
    // 한 번에 다 못 보냈으면 이어서 보낸다.
    return mutations.length > batch.length;
  }

  async function flush(flushOptions?: { keepalive?: boolean }): Promise<void> {
    if (inFlight) {
      await inFlight;
    }
    inFlight = (async () => {
      let more = true;
      while (more && !stopped) {
        more = await sendOnce(flushOptions?.keepalive ?? false);
      }
    })();
    try {
      await inFlight;
    } finally {
      inFlight = null;
    }
  }

  async function pull(): Promise<void> {
    const meta = loadMeta();
    const url = meta.cursor
      ? `/api/sync/pull?since=${encodeURIComponent(meta.cursor)}`
      : "/api/sync/pull";
    let res: Response;
    try {
      res = await fetchFn(url, { credentials: "include" });
    } catch {
      status().markOffline(statusKey);
      return;
    }
    if (res.status === 401) {
      status().markUnauthenticated();
      return;
    }
    if (!res.ok) return;
    const body = (await res.json()) as PullResponse;
    // 응답을 기다리는 동안 생긴 로컬 변경을 덮지 않도록 최신 meta 로 합친다.
    const merged = mergePullResponse(config, store.get(), loadMeta(), body);
    saveMeta(merged.meta);
    setItemsFromRemote(merged.items);
  }

  const onFocus = () => void pull();
  const onVisibility = () => {
    if (document.visibilityState === "hidden") void flush({ keepalive: true });
    else void pull();
  };
  const onOnline = () => void flush();
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("online", onOnline);

  return {
    pull,
    flush,
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      unsubscribe();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    },
  };
}
