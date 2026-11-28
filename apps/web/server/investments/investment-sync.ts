import { schema } from "@seedbook/database";
import {
  type InvestmentFields,
  investmentChildRows,
  investmentFieldsToColumns,
  investmentRowToFields,
  parseInvestmentFields,
} from "@seedbook/domain/v1/investment-record";
import { createEntityRepo, selectRowsByIds, type Tx } from "@web/server/sync/entity-repo";
import type { SyncEntity } from "@web/server/sync/registry";
import { linkNewAccount, replaceChildren } from "@web/server/sync/v1-changeseq";
import { and, inArray, isNull } from "drizzle-orm";

type AccountRow = typeof schema.investmentAccount.$inferSelect;

/**
 * 계좌의 하위 데이터(금액 기록 · 보유 주식 · 현금 항목)를 저장 내용으로 바꾼다. 빠진 행은 톰스톤
 * (동기화 v2 기기가 지운 것을 안다). 보유 주식 / 현금 항목 id 는 클라이언트가 만든 UUID 라 다른
 * 사용자의 행과 겹칠 수 있다 — 그때는 건너뛴다, 남의 행을 이 계좌로 가져오지 않는다.
 */
async function writeInvestmentChildren(tx: Tx, accountId: string, fields: InvestmentFields) {
  const rows = investmentChildRows(accountId, fields);
  const parent = { column: "accountId" as const, id: accountId };
  await replaceChildren(tx, schema.investmentRecord, parent, "date", rows.records);
  await replaceChildren(tx, schema.stockHolding, parent, "id", rows.holdings);
  await replaceChildren(tx, schema.cashItem, parent, "id", rows.cashItems);
}

export const investmentRepo = createEntityRepo<InvestmentFields, InvestmentFields>({
  table: schema.investmentAccount,
  toColumns: investmentFieldsToColumns,
  writeChildren: writeInvestmentChildren,
  // 새 계좌가 이미 이 계좌를 담은 포트폴리오보다 늦게 도착했을 수 있다.
  afterChange: async (tx, userId, id, fields) => {
    if (fields) await linkNewAccount(tx, userId, id);
  },
  toData: async (db, rows) => {
    const ids = rows.map((r) => r.id);
    const [accounts, records, holdings, cashItems] = await Promise.all([
      selectRowsByIds<AccountRow>(db, schema.investmentAccount, ids),
      db
        .select()
        .from(schema.investmentRecord)
        .where(
          and(
            inArray(schema.investmentRecord.accountId, ids),
            isNull(schema.investmentRecord.deletedAt)
          )
        ),
      db
        .select()
        .from(schema.stockHolding)
        .where(
          and(inArray(schema.stockHolding.accountId, ids), isNull(schema.stockHolding.deletedAt))
        ),
      db
        .select()
        .from(schema.cashItem)
        .where(and(inArray(schema.cashItem.accountId, ids), isNull(schema.cashItem.deletedAt))),
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
