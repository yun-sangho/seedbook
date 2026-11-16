import type { ManagedStoreConfig } from "@web/lib/sync/managed-store-config";
import type { InvestmentItem } from "../types/types";

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const text = (value: unknown) => (typeof value === "string" ? value : "");
const list = (value: unknown) =>
  Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];

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
  // 서버 검증(parseInvestmentFields)은 유한한 숫자만 받는다 — 입력 도중의 NaN 은 0 으로 보낸다.
  toData: (item) => ({
    accountName: text(item.accountName),
    accountType: text(item.accountType),
    currency: text(item.currency),
    initialInvestment: num(item.initialInvestment),
    currentValue: num(item.currentValue),
    note: text(item.note),
    color: text(item.color),
    sellCostPercent: num(item.sellCostPercent),
    records: (item.records ?? []).map((r) => ({
      date: text(r.date),
      initialInvestment: num(r.initialInvestment),
      currentValue: num(r.currentValue),
    })),
    holdings: (item.holdings ?? []).map((h) => ({
      id: text(h.id),
      market: text(h.market),
      ticker: text(h.ticker),
      name: text(h.name),
      currency: text(h.currency),
      quantity: num(h.quantity),
      memo: text(h.memo),
    })),
    cashItems: (item.cashItems ?? []).map((c) => ({
      id: text(c.id),
      label: text(c.label),
      amount: num(c.amount),
    })),
  }),
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
