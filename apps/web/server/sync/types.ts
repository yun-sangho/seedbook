/**
 * 엔티티 단위 동기화 프로토콜 (`POST /api/sync/mutations`, `GET /api/sync/pull`).
 *
 * 클라이언트는 바뀐 엔티티만 mutation 으로 보낸다. 자산은 본인만 수정하므로 기기 사이의
 * 충돌은 따지지 않고 마지막 저장이 이긴다. `version` 은 행이 바뀔 때마다 올라가며,
 * 클라이언트가 pull 에서 이미 본 변경을 걸러내는 데 쓴다.
 */

/** 한 요청에 담을 수 있는 mutation 수. 오프라인 큐가 길면 클라이언트가 나눠 보낸다. */
export const MAX_MUTATIONS = 100;

/** 동기화되는 엔티티 한 건. `deletedAt` 이 있으면 톰스톤이고 `data` 는 null. */
export type SyncedEntity<T> = {
  id: string;
  version: number;
  deletedAt: string | null;
  data: T | null;
};

export type ListOrderChange = { domain: string; order: string[] };

type EntityData = Record<string, unknown>;
export type PullChanges = Record<string, SyncedEntity<EntityData>[]> & {
  listOrder: ListOrderChange[];
};

export type MutationResult =
  | { status: "ok"; version?: number }
  | { status: "rejected"; reason: "invalid" | "forbidden" };

export type PullResult = {
  /** 다음 pull 에 `since` 로 넘길 값. 바뀐 것이 없으면 받은 `since` 를 그대로 돌려준다. */
  cursor: string | null;
  /** entity 이름 (`SYNC_ENTITIES`) → 바뀐 엔티티, 그리고 `listOrder` → 목록 순서. */
  changes: PullChanges;
};
