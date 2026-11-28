import { accountRecord, deriveRecordId, rebalancingTask, sortKeysAfter } from "@seedbook/domain";
import type { SyncV2Keys } from "../src/sync-v2-backfill";

/** backfill 이 쓰는 키 함수 — 레코드 정의(`@seedbook/domain`)의 것을 그대로 쓴다. */
export const syncV2Keys: SyncV2Keys = {
  accountRecordId: (accountId, date) =>
    deriveRecordId(accountRecord, { parentId: accountId, fields: { date } }),
  rebalancingTaskId: (rebalancingId, allocationId) =>
    deriveRecordId(rebalancingTask, { parentId: rebalancingId, fields: { allocationId } }),
  sortKeysAfter,
};
