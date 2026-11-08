import { emptySyncMeta } from "./entity-sync-core";
import { mergePullResponse } from "./entity-sync-engine";
import type { ManagedStoreConfig } from "./managed-store-config";
import { readSyncMeta, writeSyncMeta } from "./sync-meta-storage";

/**
 * persist 하이드레이션 때 서버 전체 pull 로 store 상태를 만든다 (기존 envelope GET 과
 * 같은 시점·같은 비용). 로컬에 보내지 않은 변경이 있으면 그 엔티티는 로컬 값을 유지한다.
 * 실패하면 `null` — 호출자가 로컬 캐시로 대신한다.
 */
export async function loadManagedStoreFromServer(
  config: ManagedStoreConfig<{ id: string }>,
  cachedRaw: string | null
): Promise<string | null> {
  const body = await fetchFullPull();
  if (body === null) return null;

  const cached = parseCachedState(cachedRaw);
  const cachedItems = Array.isArray(cached[config.itemsField])
    ? (cached[config.itemsField] as Array<{ id: string }>)
    : [];
  const stored = readSyncMeta(config.metaKey);
  const meta = { ...(stored?.meta ?? emptySyncMeta()), cursor: null };

  const merged = mergePullResponse(config, cachedItems, meta, body);
  writeSyncMeta(config.metaKey, { userId: stored?.userId ?? "", meta: merged.meta });

  return JSON.stringify({
    state: { ...cached, [config.itemsField]: merged.items },
    version: config.persistVersion,
  });
}

// 한 번의 전체 pull 이 모든 엔티티를 담으므로, 같은 페이지 로드에서 하이드레이션하는
// store 들이 한 요청을 나눠 쓴다. 실패하면 다음 하이드레이션(새 페이지 로드)이 다시 시도한다.
let fullPull: Promise<Parameters<typeof mergePullResponse>[3] | null> | null = null;

function fetchFullPull() {
  fullPull ??= (async () => {
    try {
      const res = await fetch("/api/sync/pull", { credentials: "include" });
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  })();
  return fullPull;
}

function parseCachedState(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
    return parsed.state ?? {};
  } catch {
    return {};
  }
}
