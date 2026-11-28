/**
 * 식물이 다음 목표에 닿았는지 — 읽기 전용 판단 (서버 목표 도달 알림용). 앱의 성장 규칙과 같은 조건이다
 * (`apps/mobile/src/features/portfolio/utils/plant-season.ts` `reachesGoal`): 다음 목표가 있고, 시세가 다 왔고,
 * 연결 계좌 평가 합이 목표 이상이고, 비중이 기준 안 (`linked-portfolio-status.ts` 와 같은 계좌별 이격 판정).
 * 실제로 자라는 것(식물 필드를 쓰는 것)은 앱이 열릴 때 한다 — 서버는 이 결과로 알림만 보낸다.
 *
 * 앱 계산과 같은지는 `apps/web/test/domain-contract/plant-goal-check.test.ts` 가 대조한다. database 패키지가
 * import 하므로 다른 모듈을 import 하지 않는다 (`database-imports.test.ts`).
 */

/** 마지막 성장 단계 (꽃). 이 단계의 목표를 이루면 열매가 열린다. */
export const LAST_PLANT_STAGE = 4;

export interface PlantGoalInput {
  goalAmount: number | null;
  stageGoals: readonly number[];
  growthStage: number;
  /** 열린 열매 (있으면 수확을 기다린다 — 다음 목표 없음). */
  fruitGoal: unknown;
}

/**
 * 식물이 향하는 다음 목표 금액 (원). 앱 `withNextStageGoal` 과 같다 — 지금 목표, 비어 있으면 단계 목표의 그
 * 단계 금액. 열매가 열렸거나 목표가 없으면 null.
 */
export function nextPlantGoalAmount(plant: PlantGoalInput): number | null {
  if (plant.fruitGoal !== null && plant.fruitGoal !== undefined) return null;
  if (plant.goalAmount !== null) return plant.goalAmount;
  const next = plant.stageGoals[plant.growthStage];
  return typeof next === "number" ? next : null;
}

export interface GoalCheckHolding {
  market: string;
  ticker: string;
  quantity: number;
}

export interface GoalCheckAccount {
  holdings: readonly GoalCheckHolding[];
  /** 현금 항목 금액들 (원). */
  cashAmounts: readonly number[];
}

export interface GoalCheckAllocation {
  market: string;
  ticker: string;
  targetPercent: number;
}

export interface DriftRule {
  driftMode: "relative" | "absolute";
  driftThresholdPercent: number;
}

/** 종목 키 → 종가 (원). 없으면 시세를 못 받은 종목. */
export type PriceLookup = (market: string, ticker: string) => number | null;

export type AccountDriftState = "needs-rebalancing" | "ok" | "unknown";

const priceKey = (market: string, ticker: string) => `${market}:${ticker}`;

/** 이격률 (%) — 앱 `driftPercent` 와 같다. */
function driftPercent(targetPercent: number, actualPercent: number, mode: DriftRule["driftMode"]) {
  const diff = actualPercent - targetPercent;
  if (mode === "absolute" || targetPercent <= 0) return diff;
  return (diff / targetPercent) * 100;
}

/**
 * 계좌 하나의 비중 판정 (앱 `linkedPortfolioStatus` 의 state). 계좌의 보유와 예수금(목표 0원)으로 목표 비중
 * 대비 이격을 본다. 목표 종목이 없거나 값을 매길 게 없으면 `unknown`.
 */
export function accountDriftState(
  account: GoalCheckAccount,
  allocations: readonly GoalCheckAllocation[],
  rule: DriftRule,
  priceOf: PriceLookup
): AccountDriftState {
  const perStock = new Map<string, number>();
  let totalStockValue = 0;
  for (const h of account.holdings) {
    if (!h.market || !h.ticker) continue;
    if (!h.quantity || h.quantity <= 0) continue;
    const close = priceOf(h.market, h.ticker);
    if (close === null) continue;
    const key = priceKey(h.market, h.ticker);
    const value = h.quantity * close;
    perStock.set(key, (perStock.get(key) ?? 0) + value);
    totalStockValue += value;
  }
  const cash = account.cashAmounts.reduce((sum, amount) => sum + (amount || 0), 0);
  if (allocations.length === 0 || totalStockValue + cash <= 0) return "unknown";

  let stockBase = 0;
  for (const key of new Set(allocations.map((a) => priceKey(a.market, a.ticker)))) {
    stockBase += perStock.get(key) ?? 0;
  }
  const base = Math.max(0, stockBase + cash);
  const percentOf = (value: number) => (base > 0 ? (value / base) * 100 : 0);

  const breached = (target: number, actualValue: number) =>
    Math.abs(driftPercent(target, percentOf(actualValue), rule.driftMode)) >
    rule.driftThresholdPercent;
  // 예수금(목표 0원)도 쌓여 있으면 이격으로 본다.
  if (breached(0, cash)) return "needs-rebalancing";
  for (const a of allocations) {
    if (breached(a.targetPercent, perStock.get(priceKey(a.market, a.ticker)) ?? 0)) {
      return "needs-rebalancing";
    }
  }
  return "ok";
}

/** 포트폴리오의 비중 판정 — 한 계좌라도 이탈이면 이탈, 판정한 계좌가 모두 기준 안이면 ok. */
export function portfolioDriftState(
  accounts: readonly GoalCheckAccount[],
  allocations: readonly GoalCheckAllocation[],
  rule: DriftRule,
  priceOf: PriceLookup
): AccountDriftState {
  let state: AccountDriftState = "unknown";
  for (const account of accounts) {
    const accountState = accountDriftState(account, allocations, rule, priceOf);
    if (accountState === "needs-rebalancing") return accountState;
    if (accountState === "ok") state = "ok";
  }
  return state;
}

/**
 * 연결 계좌 평가 합 (원, 반올림) 과 시세가 다 왔는지 — 앱 `computePortfolioValuation` 과 같다. 종목코드가 없는
 * 옛 보유 항목은 세지 않는다.
 */
export function portfolioValue(
  accounts: readonly GoalCheckAccount[],
  priceOf: PriceLookup
): { value: number; pricesComplete: boolean } {
  let value = 0;
  let pricesComplete = true;
  for (const account of accounts) {
    for (const h of account.holdings) {
      if (!h.market || !h.ticker) continue;
      const close = priceOf(h.market, h.ticker);
      if (close === null) {
        pricesComplete = false;
        continue;
      }
      value += h.quantity * close;
    }
    value += account.cashAmounts.reduce((sum, amount) => sum + (amount || 0), 0);
  }
  return { value: Math.round(value), pricesComplete };
}

export interface PlantGoalCheck {
  /** 이번 평가로 다음 목표를 이뤘다 (앱을 열면 자란다). */
  reached: boolean;
  /** 향하는 다음 목표 (원). 없으면 null. */
  goalAmount: number | null;
  value: number;
  pricesComplete: boolean;
  drifting: boolean;
}

/** 식물이 다음 목표에 닿았는지. 연결 계좌가 없으면 닿지 않는다. */
export function checkPlantGoal(
  plant: PlantGoalInput,
  accounts: readonly GoalCheckAccount[],
  allocations: readonly GoalCheckAllocation[],
  rule: DriftRule,
  priceOf: PriceLookup
): PlantGoalCheck {
  const goalAmount = nextPlantGoalAmount(plant);
  const { value, pricesComplete } = portfolioValue(accounts, priceOf);
  const drifting =
    portfolioDriftState(accounts, allocations, rule, priceOf) === "needs-rebalancing";
  const reached =
    accounts.length > 0 &&
    goalAmount !== null &&
    pricesComplete &&
    value >= goalAmount &&
    !drifting;
  return { reached, goalAmount, value, pricesComplete, drifting };
}
