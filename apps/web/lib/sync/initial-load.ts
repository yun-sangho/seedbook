import { emptySyncMeta } from "./entity-sync-core";
import { mergePullResponse, readSyncMeta, writeSyncMeta } from "./entity-sync-engine";
import type { ManagedStoreConfig } from "./managed-store-config";

/**
 * persist 하이드레이션 때 서버 전체 pull 로 store 상태를 만든다 (기존 envelope GET 과
 * 같은 시점·같은 비용). 로컬에 보내지 않은 변경이 있으면 그 엔티티는 로컬 값을 유지한다.
 * 실패하면 `null` — 호출자가 로컬 캐시로 대신한다.
 */
export async function loadManagedStoreFromServer(
  config: ManagedStoreConfig<{ id: string }>,
  cachedRaw: string | null
): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch("/api/sync/pull", { credentials: "include" });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const body = await res.json();

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

function parseCachedState(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
    return parsed.state ?? {};
  } catch {
    return {};
  }
}
