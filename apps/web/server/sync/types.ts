import type { DebtPayload } from "@web/server/debts/debt-record";

/**
 * 엔티티 단위 동기화 프로토콜 (`POST /api/sync/mutations`, `GET /api/sync/pull`).
 *
 * 클라이언트는 바뀐 엔티티만 mutation 으로 보내고, 각 mutation 은 마지막으로 본
 * `version` 을 `baseVersion` 으로 싣는다 (새 엔티티는 0). 서버 version 과 다르면
 * 충돌로 현재 값을 돌려준다 — 덮어쓰지 않는다.
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

export type SyncedDebt = SyncedEntity<Omit<DebtPayload, "id">>;

export type ListOrderChange = { domain: string; order: string[] };

export type MutationResult =
  | { status: "ok"; version?: number }
  | { status: "conflict"; current: SyncedEntity<unknown> | null }
  | { status: "rejected"; reason: "invalid" | "forbidden" };

export type PullResult = {
  /** 다음 pull 에 `since` 로 넘길 값. 바뀐 것이 없으면 받은 `since` 를 그대로 돌려준다. */
  cursor: string | null;
  changes: {
    debt: SyncedDebt[];
    listOrder: ListOrderChange[];
  };
};
