import type { schema } from "@seedbook/database";
import {
  bigIntToNumber,
  formatDate,
  parseDate,
  toBigInt,
} from "@web/app/api/storage/_translators/types";

/**
 * 투자 계좌 한 건의 동기화 표현 (`features/investments` 의 `InvestmentItem`, id 제외).
 * 금액 기록 · 보유 주식 · 현금 항목은 계좌에 딸린 하위 데이터라 계좌와 함께 주고받는다.
 */
export type InvestmentFields = {
  accountName: string;
  accountType: string;
  currency: string;
  initialInvestment: number;
  currentValue: number;
  note: string;
  color: string;
  records: Array<{ date: string; initialInvestment: number; currentValue: number }>;
  holdings: Array<{
    id: string;
    market: string;
    ticker: string;
    name: string;
    currency: string;
    quantity: number;
    memo: string;
  }>;
  cashItems: Array<{ id: string; label: string; amount: number }>;
};

type AccountRow = typeof schema.investmentAccount.$inferSelect;
type RecordRow = typeof schema.investmentRecord.$inferSelect;
type HoldingRow = typeof schema.stockHolding.$inferSelect;
type CashRow = typeof schema.cashItem.$inferSelect;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isText = (x: unknown): x is string => typeof x === "string";
const isNumber = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isUuid = (x: unknown): x is string => isText(x) && UUID_RE.test(x);
const asObject = (x: unknown) =>
  x && typeof x === "object" ? (x as Record<string, unknown>) : null;

/** 외부 입력 검증. 잘못된 모양이면 `null` (하위 항목 하나라도 틀리면 전체 거부). */
export function parseInvestmentFields(value: unknown): InvestmentFields | null {
  const v = asObject(value);
  if (!v) return null;
  const note = v.note ?? "";
  const rawRecords = v.records ?? [];
  const rawHoldings = v.holdings ?? [];
  const rawCash = v.cashItems ?? [];
  if (
    !isText(v.accountName) ||
    !isText(v.accountType) ||
    !isText(v.currency) ||
    !isNumber(v.initialInvestment) ||
    !isNumber(v.currentValue) ||
    !isText(note) ||
    !isText(v.color) ||
    !Array.isArray(rawRecords) ||
    !Array.isArray(rawHoldings) ||
    !Array.isArray(rawCash)
  ) {
    return null;
  }

  const records: InvestmentFields["records"] = [];
  for (const raw of rawRecords) {
    const r = asObject(raw);
    if (
      !r ||
      !isText(r.date) ||
      parseDate(r.date) === null ||
      !isNumber(r.initialInvestment) ||
      !isNumber(r.currentValue)
    ) {
      return null;
    }
    records.push({
      date: r.date,
      initialInvestment: r.initialInvestment,
      currentValue: r.currentValue,
    });
  }

  const holdings: InvestmentFields["holdings"] = [];
  for (const raw of rawHoldings) {
    const h = asObject(raw);
    const memo = h?.memo ?? "";
    if (
      !h ||
      !isUuid(h.id) ||
      !isText(h.market) ||
      !isText(h.ticker) ||
      !isText(h.name) ||
      !isText(h.currency) ||
      !isNumber(h.quantity) ||
      !isText(memo)
    ) {
      return null;
    }
    holdings.push({
      id: h.id,
      market: h.market,
      ticker: h.ticker,
      name: h.name,
      currency: h.currency,
      quantity: h.quantity,
      memo,
    });
  }

  const cashItems: InvestmentFields["cashItems"] = [];
  for (const raw of rawCash) {
    const c = asObject(raw);
    if (!c || !isUuid(c.id) || !isText(c.label) || !isNumber(c.amount)) return null;
    cashItems.push({ id: c.id, label: c.label, amount: c.amount });
  }

  return {
    accountName: v.accountName,
    accountType: v.accountType,
    currency: v.currency,
    initialInvestment: v.initialInvestment,
    currentValue: v.currentValue,
    note,
    color: v.color,
    records,
    holdings,
    cashItems,
  };
}

/** 계좌 행 컬럼 (id / userId / 동기화 컬럼 / portfolioId 제외 — 연결은 포트폴리오 쪽이 정한다). */
export function investmentFieldsToColumns(fields: InvestmentFields) {
  return {
    accountName: fields.accountName,
    accountType: fields.accountType,
    currency: fields.currency,
    initialInvestment: toBigInt(fields.initialInvestment),
    currentValue: toBigInt(fields.currentValue),
    note: fields.note,
    color: fields.color,
  };
}

/** 하위 테이블 행. 날짜가 깨진 기록은 버린다. */
export function investmentChildRows(accountId: string, fields: InvestmentFields) {
  return {
    records: fields.records
      .map((r) => {
        const date = parseDate(r.date);
        return date
          ? {
              accountId,
              date,
              initialInvestment: toBigInt(r.initialInvestment),
              currentValue: toBigInt(r.currentValue),
            }
          : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null),
    holdings: fields.holdings.map((h) => ({ ...h, accountId })),
    cashItems: fields.cashItems.map((c) => ({
      id: c.id,
      accountId,
      label: c.label,
      amount: toBigInt(c.amount),
    })),
  };
}

/** DB 행 + 하위 행 → 동기화 표현. 기록은 최신 날짜가 먼저. */
export function investmentRowToFields(
  row: AccountRow,
  records: RecordRow[],
  holdings: HoldingRow[],
  cashItems: CashRow[]
): InvestmentFields {
  return {
    accountName: row.accountName,
    accountType: row.accountType,
    currency: row.currency,
    initialInvestment: bigIntToNumber(row.initialInvestment),
    currentValue: bigIntToNumber(row.currentValue),
    note: row.note,
    color: row.color,
    records: records
      .slice()
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .map((r) => ({
        date: formatDate(r.date),
        initialInvestment: bigIntToNumber(r.initialInvestment),
        currentValue: bigIntToNumber(r.currentValue),
      })),
    holdings: holdings.map((h) => ({
      id: h.id,
      market: h.market,
      ticker: h.ticker,
      name: h.name,
      currency: h.currency,
      quantity: h.quantity,
      memo: h.memo,
    })),
    cashItems: cashItems.map((c) => ({
      id: c.id,
      label: c.label,
      amount: bigIntToNumber(c.amount),
    })),
  };
}
