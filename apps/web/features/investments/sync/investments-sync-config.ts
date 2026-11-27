import type { ManagedStoreConfig } from "@web/lib/sync/managed-store-config";
import { listOf, finiteNumber as num, text } from "@web/lib/sync/normalize-values";
import type { CashItem, InvestmentItem, InvestmentRecord, StockHolding } from "../types/types";

const list = (value: unknown) =>
  Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];

/** 매도 제비용률 (%) — 서버 검증 범위(0 이상 100 미만) 밖이면 0. */
const sellCostPercent = (value: unknown) => {
  const percent = num(value);
  return percent >= 0 && percent < 100 ? percent : 0;
};

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

/** 저장 전 값 정리 — 서버 검증(parseInvestmentFields)이 받는 값으로. 모르는 필드는 남긴다. */
function normalizeInvestment(item: InvestmentItem): InvestmentItem {
  return {
    ...item,
    accountName: text(item.accountName),
    accountType: text(item.accountType),
    currency: text(item.currency),
    initialInvestment: num(item.initialInvestment),
    currentValue: num(item.currentValue),
    note: text(item.note),
    color: text(item.color),
    sellCostPercent: sellCostPercent(item.sellCostPercent),
    records: listOf(item.records).map(normalizeRecord),
    holdings: listOf(item.holdings).map(normalizeHolding),
    cashItems: listOf(item.cashItems).map(normalizeCash),
  };
}

/**
 * 투자 store (`investment-storage`) 의 엔티티 동기화 설정. store 를 import 하지 않는다 —
 * hybrid-storage 가 store 보다 먼저 이 설정을 읽는다.
 *
 * 보유 주식 정렬(`holdingsSortOption`)은 목록이 아니라 화면 설정이라 동기화하지 않고
 * 기기마다 로컬 캐시에 남는다.
 */
export const investmentsSyncConfig: ManagedStoreConfig<InvestmentItem> = {
  storageKey: "investment-storage",
  entity: "investment",
  listOrderDomain: "investment-accounts",
  metaKey: "seedbook.sync.investment",
  persistVersion: 6,
  itemsField: "investments",
  normalizeItem: normalizeInvestment,
  toData: (raw) => {
    const item = normalizeInvestment(raw);
    return {
      accountName: item.accountName,
      accountType: item.accountType,
      currency: item.currency,
      initialInvestment: item.initialInvestment,
      currentValue: item.currentValue,
      note: item.note,
      color: item.color,
      sellCostPercent: item.sellCostPercent,
      records: item.records.map((r) => ({
        date: r.date,
        initialInvestment: r.initialInvestment,
        currentValue: r.currentValue,
      })),
      holdings: item.holdings.map((h) => ({
        id: h.id,
        market: h.market,
        ticker: h.ticker,
        name: h.name,
        currency: h.currency,
        quantity: h.quantity,
        memo: h.memo,
      })),
      cashItems: item.cashItems.map((c) => ({ id: c.id, label: c.label, amount: c.amount })),
    };
  },
  fromData: (id, data) => ({
    id,
    accountName: text(data.accountName),
    accountType: text(data.accountType),
    currency: text(data.currency),
    initialInvestment: num(data.initialInvestment),
    currentValue: num(data.currentValue),
    records: list(data.records).map((r) => ({
      date: text(r.date),
      initialInvestment: num(r.initialInvestment),
      currentValue: num(r.currentValue),
    })),
    holdings: list(data.holdings).map((h) => ({
      id: text(h.id),
      market: text(h.market),
      ticker: text(h.ticker),
      name: text(h.name),
      currency: text(h.currency),
      quantity: num(h.quantity),
      memo: text(h.memo),
    })),
    cashItems: list(data.cashItems).map((c) => ({
      id: text(c.id),
      label: text(c.label),
      amount: num(c.amount),
    })),
    note: text(data.note),
    color: text(data.color),
    sellCostPercent: num(data.sellCostPercent),
  }),
};
