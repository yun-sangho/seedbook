import {
  listOf,
  finiteNumberOrNull as nullableNum,
  finiteNumber as num,
  text,
} from "@web/lib/sync/normalize-values";
import type {
  RebalancingResult,
  RebalancingResultHolding,
  RebalancingSession,
  RebalancingTask,
} from "../types/types";

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
    filledQuantity: nullableNum(v.filledQuantity),
    filledAmount: nullableNum(v.filledAmount),
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

/** 저장 전 값 정리 — 레코드 정의가 받는 값으로. 모르는 필드는 남긴다. */
export function normalizeSession(item: RebalancingSession): RebalancingSession {
  const result = toResult(item.result);
  return {
    ...item,
    accountId: text(item.accountId),
    accountName: text(item.accountName),
    portfolioId: text(item.portfolioId),
    portfolioName: text(item.portfolioName),
    cashDelta: num(item.cashDelta),
    tasks: listOf(item.tasks).map((task) => ({ ...task, ...toTask(task) })),
    result:
      result && item.result
        ? {
            ...item.result,
            ...result,
            holdings: item.result.holdings.map((h) => ({ ...h, ...toResultHolding(h) })),
          }
        : result,
  };
}
