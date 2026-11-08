import { schema, syncAccountPortfolioLinks } from "@seedbook/database";
import { createEntityRepo, selectRowsByIds, type Tx } from "@web/server/sync/entity-repo";
import type { SyncEntity } from "@web/server/sync/registry";
import { eq, inArray } from "drizzle-orm";
import {
  investmentChildRows,
  investmentFieldsToColumns,
  investmentRowToFields,
  parseInvestmentFields,
  type InvestmentFields,
} from "./investment-record";

type AccountRow = typeof schema.investmentAccount.$inferSelect;

/**
 * 계좌의 하위 데이터(금액 기록 · 보유 주식 · 현금 항목)를 저장 내용으로 통째로 바꾼다.
 * 보유 주식 / 현금 항목 id 는 클라이언트가 만든 UUID 라 다른 사용자의 행과 겹칠 수 있다 —
 * 그때는 건너뛴다 (`onConflictDoNothing`), 남의 행을 이 계좌로 가져오지 않는다.
 */
async function writeInvestmentChildren(tx: Tx, accountId: string, fields: InvestmentFields) {
  const rows = investmentChildRows(accountId, fields);
  await tx.delete(schema.investmentRecord).where(eq(schema.investmentRecord.accountId, accountId));
  await tx.delete(schema.stockHolding).where(eq(schema.stockHolding.accountId, accountId));
  await tx.delete(schema.cashItem).where(eq(schema.cashItem.accountId, accountId));
  if (rows.records.length > 0) {
    await tx.insert(schema.investmentRecord).values(rows.records).onConflictDoNothing();
  }
  if (rows.holdings.length > 0) {
    await tx.insert(schema.stockHolding).values(rows.holdings).onConflictDoNothing();
  }
  if (rows.cashItems.length > 0) {
    await tx.insert(schema.cashItem).values(rows.cashItems).onConflictDoNothing();
  }
}

export const investmentRepo = createEntityRepo<InvestmentFields, InvestmentFields>({
  table: schema.investmentAccount,
  toColumns: investmentFieldsToColumns,
  writeChildren: writeInvestmentChildren,
  // 새 계좌가 이미 이 계좌를 담은 포트폴리오보다 늦게 도착했을 수 있다.
  afterChange: (tx, userId) => syncAccountPortfolioLinks(tx, userId),
  toData: async (db, rows) => {
    const ids = rows.map((r) => r.id);
    const [accounts, records, holdings, cashItems] = await Promise.all([
      selectRowsByIds<AccountRow>(db, schema.investmentAccount, ids),
      db
        .select()
        .from(schema.investmentRecord)
        .where(inArray(schema.investmentRecord.accountId, ids)),
      db.select().from(schema.stockHolding).where(inArray(schema.stockHolding.accountId, ids)),
      db.select().from(schema.cashItem).where(inArray(schema.cashItem.accountId, ids)),
    ]);
    return new Map(
      accounts.map((a) => [
        a.id,
        investmentRowToFields(
          a,
          records.filter((r) => r.accountId === a.id),
          holdings.filter((h) => h.accountId === a.id),
          cashItems.filter((c) => c.accountId === a.id)
        ),
      ])
    );
  },
});

export const investmentSyncEntity: SyncEntity = {
  entity: "investment",
  parseFields: parseInvestmentFields,
  upsert: investmentRepo.upsert as SyncEntity["upsert"],
  remove: investmentRepo.remove,
  changes: investmentRepo.changes,
};
