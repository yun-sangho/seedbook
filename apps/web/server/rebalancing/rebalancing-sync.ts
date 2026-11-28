import { schema } from "@seedbook/database";
import {
  parseRebalancingFields,
  type RebalancingPayload,
  rebalancingPayloadToColumns,
  rebalancingRowToPayload,
} from "@seedbook/domain/v1/rebalancing-record";
import { createEntityRepo, selectRowsByIds } from "@web/server/sync/entity-repo";
import type { SyncEntity } from "@web/server/sync/registry";

type RebalancingFields = Omit<RebalancingPayload, "id">;
type RebalancingRow = typeof schema.rebalancing.$inferSelect;

const rebalancingRepo = createEntityRepo<RebalancingFields, RebalancingFields>({
  table: schema.rebalancing,
  toColumns: rebalancingPayloadToColumns,
  toData: async (db, rows) => {
    const full = await selectRowsByIds<RebalancingRow>(
      db,
      schema.rebalancing,
      rows.map((r) => r.id)
    );
    return new Map(
      full.map((row) => {
        const data: RebalancingFields & { id?: string } = rebalancingRowToPayload(row);
        delete data.id;
        return [row.id, data];
      })
    );
  },
});

export const rebalancingSyncEntity: SyncEntity = {
  entity: "rebalancing",
  parseFields: parseRebalancingFields,
  upsert: rebalancingRepo.upsert as SyncEntity["upsert"],
  remove: rebalancingRepo.remove,
  changes: rebalancingRepo.changes,
};
