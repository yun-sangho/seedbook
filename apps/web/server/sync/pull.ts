import type { Database } from "@seedbook/database";
import { listOrderChanges } from "./list-order";
import { SYNC_ENTITIES } from "./registry";
import type { PullChanges, PullResult, SyncedEntity } from "./types";

/**
 * 커밋 순서와 `updatedAt` 순서가 어긋날 수 있어 (동시 트랜잭션), 커서보다 조금 앞부터
 * 다시 읽는다. 같은 행을 두 번 받을 수 있지만 클라이언트는 version 으로 걸러낸다.
 */
export const PULL_OVERLAP_MS = 5_000;

/**
 * `since` (이전 pull 의 cursor) 이후 바뀐 엔티티를 모은다. `since` 가 null 이면 첫
 * 동기화로 살아 있는 전체를 돌려준다.
 */
export async function pullChanges(
  db: Database,
  userId: string,
  since: string | null
): Promise<PullResult> {
  const sinceDate = since ? new Date(new Date(since).getTime() - PULL_OVERLAP_MS) : null;

  const [entityChanges, listOrders] = await Promise.all([
    Promise.all(SYNC_ENTITIES.map((e) => e.changes(db, userId, sinceDate))),
    listOrderChanges(db, userId, sinceDate),
  ]);

  const changes: Record<string, SyncedEntity<unknown>[]> = {};
  SYNC_ENTITIES.forEach((e, i) => {
    changes[e.entity] = entityChanges[i]!.rows;
  });
  changes.listOrder = listOrders.rows as never;

  const latest = [...entityChanges.map((c) => c.latest), listOrders.latest].reduce<Date | null>(
    (max, d) => (d && (max === null || d > max) ? d : max),
    null
  );

  return {
    cursor: latest ? latest.toISOString() : since,
    changes: changes as PullChanges,
  };
}
