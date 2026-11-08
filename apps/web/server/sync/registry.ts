import type { Database } from "@seedbook/database";
import { investmentSyncEntity } from "@web/server/investments/investment-sync";
import { portfolioSyncEntity } from "@web/server/portfolio/portfolio-sync";
import { rebalancingSyncEntity } from "@web/server/rebalancing/rebalancing-sync";
import type { MutationResult, SyncedEntity } from "./types";

/**
 * `/api/sync/*` 가 다루는 엔티티 하나. 도메인을 옮길 때마다 `SYNC_ENTITIES` 에 추가한다 —
 * mutation 적용과 pull 은 이 목록을 돌며 처리하므로 다른 곳은 고칠 필요가 없다.
 */
export type SyncEntity = {
  /** mutation 의 `entity` 이자 pull 응답 `changes` 의 key. */
  entity: string;
  /** 클라이언트가 보낸 id 의 모양 검사. 기본은 UUID. */
  isValidId?: (id: string) => boolean;
  /** 외부 입력 검증. 잘못된 모양이면 null. */
  parseFields: (data: unknown) => unknown | null;
  upsert: (db: Database, userId: string, id: string, fields: never) => Promise<MutationResult>;
  remove: (db: Database, userId: string, id: string) => Promise<MutationResult>;
  changes: (
    db: Database,
    userId: string,
    since: Date | null
  ) => Promise<{ rows: SyncedEntity<unknown>[]; latest: Date | null }>;
};

export const SYNC_ENTITIES: SyncEntity[] = [
  investmentSyncEntity,
  portfolioSyncEntity,
  rebalancingSyncEntity,
];

export function findSyncEntity(entity: unknown): SyncEntity | null {
  return SYNC_ENTITIES.find((e) => e.entity === entity) ?? null;
}
