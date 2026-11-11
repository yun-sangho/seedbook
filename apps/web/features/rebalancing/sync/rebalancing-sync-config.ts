import type { ManagedStoreConfig } from "@web/lib/sync/managed-store-config";
import type {
  RebalancingResult,
  RebalancingResultHolding,
  RebalancingSession,
  RebalancingTask,
} from "../types/types";

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const nullableNum = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const text = (value: unknown) => (typeof value === "string" ? value : "");

function toTask(value: unknown): RebalancingTask {
  const v = (value ?? {}) as Record<string, unknown>;
  return {
    id: text(v.id),
    market: text(v.market),
    ticker: text(v.ticker),
    name: text(v.name),
    action: v.action === "매도" ? "매도" : "매수",
    amount: num(v.amount),
    price: nullableNum(v.price),
    quantity: nullableNum(v.quantity),
    executedQuantity: nullableNum(v.executedQuantity),
    executedPrice: nullableNum(v.executedPrice),
    orderedQuantity: nullableNum(v.orderedQuantity),
    orderedPrice: nullableNum(v.orderedPrice),
    priceAsOf: typeof v.priceAsOf === "string" ? v.priceAsOf : null,
    priceKind: v.priceKind === "realtime" || v.priceKind === "close" ? v.priceKind : null,
    done: v.done === true,
  };
}

function toResultHolding(value: unknown): RebalancingResultHolding {
  const v = (value ?? {}) as Record<string, unknown>;
  return {
    market: text(v.market),
    ticker: text(v.ticker),
    name: text(v.name),
    quantity: num(v.quantity),
    change: num(v.change),
    percent: nullableNum(v.percent),
    targetPercent: num(v.targetPercent),
  };
}

/** 결과가 없거나 (그 전에 완료한 기록) 모양이 이상하면 null. */
function toResult(value: unknown): RebalancingResult | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.holdings)) return null;
  return {
    holdings: v.holdings.map(toResultHolding),
    cash: num(v.cash),
    cashPercent: nullableNum(v.cashPercent),
    cashBefore: nullableNum(v.cashBefore),
  };
}

/**
 * 리밸런싱 store (`rebalancing-storage`) 의 엔티티 동기화 설정. store 를 import 하지
 * 않는다 — hybrid-storage 가 store 보다 먼저 이 설정을 읽는다.
 */
export const rebalancingSyncConfig: ManagedStoreConfig<RebalancingSession> = {
  storageKey: "rebalancing-storage",
  entity: "rebalancing",
  listOrderDomain: "rebalancings",
  metaKey: "seedbook.sync.rebalancing",
  persistVersion: 1,
  itemsField: "sessions",
  toData: (item) => ({
    accountId: text(item.accountId),
    accountName: text(item.accountName),
    portfolioId: text(item.portfolioId),
    portfolioName: text(item.portfolioName),
    cashDelta: num(item.cashDelta),
    tasks: item.tasks.map(toTask),
    startedAt: item.startedAt,
    completedAt: item.completedAt,
    result: toResult(item.result),
  }),
  fromData: (id, data) => ({
    id,
    accountId: text(data.accountId),
    accountName: text(data.accountName),
    portfolioId: text(data.portfolioId),
    portfolioName: text(data.portfolioName),
    cashDelta: num(data.cashDelta),
    tasks: Array.isArray(data.tasks) ? data.tasks.map(toTask) : [],
    startedAt: text(data.startedAt),
    completedAt: typeof data.completedAt === "string" ? data.completedAt : null,
    result: toResult(data.result),
  }),
};
