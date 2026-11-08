import { schema } from "@seedbook/database";
import { createEntityRepo, selectRowsByIds } from "@web/server/sync/entity-repo";
import type { SyncEntity } from "@web/server/sync/registry";
import {
  debtPayloadToColumns,
  debtRowToPayload,
  parseDebtFields,
  type DebtPayload,
} from "./debt-record";

type DebtFields = Omit<DebtPayload, "id">;
type DebtRow = typeof schema.debt.$inferSelect;

const debtRepo = createEntityRepo<DebtFields, DebtFields>({
  table: schema.debt,
  toColumns: debtPayloadToColumns,
  toData: async (db, rows) => {
    const full = await selectRowsByIds<DebtRow>(
      db,
      schema.debt,
      rows.map((r) => r.id)
    );
    return new Map(
      full.map((row) => {
        const { id, ...data } = debtRowToPayload(row);
        return [id, data];
      })
    );
  },
});

export const debtSyncEntity: SyncEntity = {
  entity: "debt",
  parseFields: parseDebtFields,
  upsert: debtRepo.upsert as SyncEntity["upsert"],
  remove: debtRepo.remove,
  changes: debtRepo.changes,
};
