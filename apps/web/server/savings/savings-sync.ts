import { schema } from "@seedbook/database";
import { createEntityRepo, selectRowsByIds } from "@web/server/sync/entity-repo";
import type { SyncEntity } from "@web/server/sync/registry";
import { eq, inArray } from "drizzle-orm";
import {
  parseSavingsFields,
  savingsFieldsToColumns,
  savingsRecordsToRows,
  savingsRowToFields,
  type SavingsFields,
} from "./savings-record";

type SavingsRow = typeof schema.savingsAccount.$inferSelect;

const savingsRepo = createEntityRepo<SavingsFields, SavingsFields>({
  table: schema.savingsAccount,
  toColumns: savingsFieldsToColumns,
  // 잔액 기록은 계좌의 일부 — 저장할 때마다 통째로 바꾼다.
  writeChildren: async (tx, id, fields) => {
    await tx.delete(schema.savingsRecord).where(eq(schema.savingsRecord.accountId, id));
    const rows = savingsRecordsToRows(id, fields);
    if (rows.length > 0) await tx.insert(schema.savingsRecord).values(rows).onConflictDoNothing();
  },
  toData: async (db, rows) => {
    const ids = rows.map((r) => r.id);
    const [accounts, records] = await Promise.all([
      selectRowsByIds<SavingsRow>(db, schema.savingsAccount, ids),
      db.select().from(schema.savingsRecord).where(inArray(schema.savingsRecord.accountId, ids)),
    ]);
    return new Map(
      accounts.map((account) => [
        account.id,
        savingsRowToFields(
          account,
          records.filter((r) => r.accountId === account.id)
        ),
      ])
    );
  },
});

export const savingsSyncEntity: SyncEntity = {
  entity: "savings",
  parseFields: parseSavingsFields,
  upsert: savingsRepo.upsert as SyncEntity["upsert"],
  remove: savingsRepo.remove,
  changes: savingsRepo.changes,
};
