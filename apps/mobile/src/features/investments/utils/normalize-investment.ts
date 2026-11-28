import { listOf, finiteNumber as num, text } from "@mobile/lib/sync/normalize-values";
import type { CashItem, InvestmentItem, InvestmentRecord, StockHolding } from "../types/types";

const normalizeRecord = (r: InvestmentRecord): InvestmentRecord => ({
  ...r,
  date: text(r.date),
  initialInvestment: num(r.initialInvestment),
  currentValue: num(r.currentValue),
});

const normalizeHolding = (h: StockHolding): StockHolding => ({
  ...h,
  id: text(h.id),
  market: text(h.market),
  ticker: text(h.ticker),
  name: text(h.name),
  currency: text(h.currency),
  quantity: num(h.quantity),
  memo: text(h.memo),
});

const normalizeCash = (c: CashItem): CashItem => ({
  ...c,
  id: text(c.id),
  label: text(c.label),
  amount: num(c.amount),
});

/** 저장 전 값 정리 — 레코드 정의가 받는 값으로 (NaN·null → 0 등). 모르는 필드는 남긴다. */
export function normalizeInvestment(item: InvestmentItem): InvestmentItem {
  return {
    ...item,
    accountName: text(item.accountName),
    accountType: text(item.accountType),
    currency: text(item.currency),
    initialInvestment: num(item.initialInvestment),
    currentValue: num(item.currentValue),
    note: text(item.note),
    color: text(item.color),
    records: listOf(item.records).map(normalizeRecord),
    holdings: listOf(item.holdings).map(normalizeHolding),
    cashItems: listOf(item.cashItems).map(normalizeCash),
  };
}
