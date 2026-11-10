import type { schema } from "@seedbook/database";
import { bigIntToNumber, toBigInt } from "@web/app/api/storage/_translators/types";
import type {
  RebalancingResult,
  RebalancingResultHolding,
  RebalancingSession,
  RebalancingTask,
} from "@web/features/rebalancing/types/types";

/**
 * 리밸런싱 한 건의 클라이언트 표현 (`features/rebalancing` 의 `RebalancingSession`).
 * envelope translator 와 엔티티 동기화 API 가 같은 변환을 쓴다.
 */
export type RebalancingPayload = RebalancingSession;

type RebalancingRow = typeof schema.rebalancing.$inferSelect;

/** 한 리밸런싱에 담을 수 있는 할 일 수. 포트폴리오 종목 수보다 넉넉하게. */
export const MAX_REBALANCING_TASKS = 200;

/** 결과 스냅샷에 담을 수 있는 종목 수. 할 일 수와 같은 한도. */
const MAX_RESULT_HOLDINGS = MAX_REBALANCING_TASKS;

/** DB 행 → 클라이언트 표현. */
export function rebalancingRowToPayload(row: RebalancingRow): RebalancingPayload {
  return {
    id: row.id,
    accountId: row.accountId,
    accountName: row.accountName,
    portfolioId: row.portfolioId,
    portfolioName: row.portfolioName,
    cashDelta: bigIntToNumber(row.cashDelta),
    // 저장 전에 parseRebalancingFields 로 검증한 값만 들어간다.
    tasks: Array.isArray(row.tasks) ? (row.tasks as RebalancingTask[]) : [],
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    // 저장 전에 parseRebalancingFields 로 검증한 값만 들어간다.
    result: (row.result as RebalancingResult | null) ?? null,
  };
}

/** 클라이언트 표현 → 갱신 가능한 컬럼 값 (id / userId / 동기화 컬럼 제외). */
export function rebalancingPayloadToColumns(payload: Omit<RebalancingPayload, "id">) {
  return {
    accountId: payload.accountId,
    accountName: payload.accountName,
    portfolioId: payload.portfolioId,
    portfolioName: payload.portfolioName,
    cashDelta: toBigInt(Math.round(payload.cashDelta)),
    tasks: payload.tasks,
    startedAt: new Date(payload.startedAt),
    completedAt: payload.completedAt ? new Date(payload.completedAt) : null,
    result: payload.result ?? null,
  };
}

const isText = (x: unknown): x is string => typeof x === "string";
const isNumber = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isNullableNumber = (x: unknown): x is number | null => x === null || isNumber(x);
const isTimestamp = (x: unknown): x is string => isText(x) && !Number.isNaN(Date.parse(x));

function parseTask(value: unknown): RebalancingTask | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    !isText(v.id) ||
    !isText(v.market) ||
    !isText(v.ticker) ||
    !isText(v.name) ||
    (v.action !== "매수" && v.action !== "매도") ||
    !isNumber(v.amount) ||
    !isNullableNumber(v.price) ||
    !isNullableNumber(v.quantity) ||
    typeof v.done !== "boolean"
  ) {
    return null;
  }
  // 가격 기준 시각은 나중에 추가된 필드라 없으면 null (그 전에 시작한 리밸런싱).
  const priceAsOf = v.priceAsOf ?? null;
  const priceKind = v.priceKind ?? null;
  if (priceAsOf !== null && !isTimestamp(priceAsOf)) return null;
  if (priceKind !== null && priceKind !== "realtime" && priceKind !== "close") return null;
  // 실제로 사고판 수량도 나중에 추가된 필드라 없으면 null (권장 수량대로 거래한 것으로 본다).
  const executedQuantity = v.executedQuantity ?? null;
  if (!isNullableNumber(executedQuantity)) return null;
  // 실제로 사고판 가격도 나중에 추가된 필드라 없으면 null (시작 시점 가격으로 거래한 것으로 본다).
  const executedPrice = v.executedPrice ?? null;
  if (!isNullableNumber(executedPrice)) return null;
  // 알려진 필드만 남긴다 — jsonb 컬럼에 임의 데이터가 쌓이지 않게.
  return {
    id: v.id,
    market: v.market,
    ticker: v.ticker,
    name: v.name,
    action: v.action,
    amount: v.amount,
    price: v.price,
    quantity: v.quantity,
    priceAsOf,
    priceKind,
    executedQuantity,
    executedPrice,
    done: v.done,
  };
}

function parseResultHolding(value: unknown): RebalancingResultHolding | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    !isText(v.market) ||
    !isText(v.ticker) ||
    !isText(v.name) ||
    !isNumber(v.quantity) ||
    !isNumber(v.change) ||
    !isNullableNumber(v.percent) ||
    !isNumber(v.targetPercent)
  ) {
    return null;
  }
  return {
    market: v.market,
    ticker: v.ticker,
    name: v.name,
    quantity: v.quantity,
    change: v.change,
    percent: v.percent,
    targetPercent: v.targetPercent,
  };
}

/** `undefined` = 잘못된 모양, `null` = 결과 없음. */
function parseResult(value: unknown): RebalancingResult | null | undefined {
  // 결과는 나중에 추가된 필드라 없으면 null (그 전에 완료했거나 계좌에 반영하지 않음).
  if (value === undefined || value === null) return null;
  if (typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  if (
    !Array.isArray(v.holdings) ||
    v.holdings.length > MAX_RESULT_HOLDINGS ||
    !isNumber(v.cash) ||
    !isNullableNumber(v.cashPercent) ||
    // 반영 전 예수금은 나중에 추가된 필드라 없을 수 있다.
    !isNullableNumber(v.cashBefore ?? null)
  ) {
    return undefined;
  }
  const holdings: RebalancingResultHolding[] = [];
  for (const raw of v.holdings) {
    const holding = parseResultHolding(raw);
    if (!holding) return undefined;
    holdings.push(holding);
  }
  // 알려진 필드만 남긴다 — jsonb 컬럼에 임의 데이터가 쌓이지 않게.
  return {
    holdings,
    cash: v.cash,
    cashPercent: v.cashPercent,
    ...(isNumber(v.cashBefore) ? { cashBefore: v.cashBefore } : {}),
  };
}

/**
 * 외부 입력을 리밸런싱 필드로 검증한다. 잘못된 모양이면 `null`.
 */
export function parseRebalancingFields(value: unknown): Omit<RebalancingPayload, "id"> | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const completedAt = v.completedAt ?? null;
  if (
    !isText(v.accountId) ||
    !isText(v.accountName) ||
    !isText(v.portfolioId) ||
    !isText(v.portfolioName) ||
    !isNumber(v.cashDelta) ||
    !isTimestamp(v.startedAt) ||
    (completedAt !== null && !isTimestamp(completedAt)) ||
    !Array.isArray(v.tasks) ||
    v.tasks.length > MAX_REBALANCING_TASKS
  ) {
    return null;
  }

  const tasks: RebalancingTask[] = [];
  for (const raw of v.tasks) {
    const task = parseTask(raw);
    if (!task) return null;
    tasks.push(task);
  }

  const result = parseResult(v.result);
  if (result === undefined) return null;

  return {
    accountId: v.accountId,
    accountName: v.accountName,
    portfolioId: v.portfolioId,
    portfolioName: v.portfolioName,
    cashDelta: v.cashDelta,
    tasks,
    startedAt: v.startedAt,
    completedAt,
    result,
  };
}
