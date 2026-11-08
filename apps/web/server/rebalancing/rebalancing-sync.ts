import { schema } from "@seedbook/database";
import { createEntityRepo, selectRowsByIds } from "@web/server/sync/entity-repo";
import type { SyncEntity } from "@web/server/sync/registry";
import {
  parseRebalancingFields,
  rebalancingPayloadToColumns,
  rebalancingRowToPayload,
  type RebalancingPayload,
} from "./rebalancing-record";

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
