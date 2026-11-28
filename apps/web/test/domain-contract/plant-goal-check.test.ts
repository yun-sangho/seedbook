// @vitest-environment node

import type { InvestmentItem } from "@mobile/features/investments/types/types";
import type { StockPricePoint } from "@mobile/features/investments/utils/use-stock-prices";
import type { PortfolioItem } from "@mobile/features/portfolio/types/types";
import { advancePlant } from "@mobile/features/portfolio/utils/plant-season";
import { readPlantProgress } from "@mobile/features/portfolio/utils/portfolio-plant";
import { portfolioPlantEvaluation } from "@mobile/features/portfolio/utils/portfolio-plant-view";
import { checkPlantGoal, type GoalCheckAccount } from "@seedbook/domain/plant-goal-check";
import { describe, expect, it } from "vitest";

/**
 * 서버 목표 도달 판단(`@seedbook/domain/plant-goal-check`) 이 앱의 평가·성장 규칙과 같은 답을 내는지 대조한다.
 * 무작위(고정 시드) 계좌·목표 비중·시세·식물로 앱의 `portfolioPlantEvaluation` + `advancePlant` 와 비교한다.
 */

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TICKERS = ["005930", "000660", "069500", "360750", "035420"];
const NOW = "2026-11-28T08:00:00.000Z";

function randomCase(rand: () => number) {
  const int = (max: number) => Math.floor(rand() * max);
  const pick = <T>(list: readonly T[]) => list[int(list.length)] as T;

  const prices = new Map<string, StockPricePoint>();
  for (const ticker of TICKERS) {
    if (rand() < 0.9) {
      prices.set(`KOSPI:${ticker}`, {
        close: 1000 + int(200_000),
        date: "2026-11-27",
        asOf: NOW,
        kind: "close",
      } as StockPricePoint);
    }
  }

  const accounts: InvestmentItem[] = Array.from({ length: 1 + int(3) }, (_, i) => ({
    id: `acc-${i}`,
    accountName: `계좌 ${i}`,
    accountType: "일반",
    currency: "KRW",
    initialInvestment: 0,
    currentValue: 0,
    records: [],
    holdings: Array.from({ length: int(4) }, (_, j) => ({
      id: `h-${i}-${j}`,
      market: rand() < 0.95 ? "KOSPI" : "",
      ticker: pick(TICKERS),
      name: "",
      currency: "KRW",
      quantity: int(5) === 0 ? 0 : 1 + int(300),
      memo: "",
    })),
    cashItems: Array.from({ length: int(3) }, (_, j) => ({
      id: `c-${i}-${j}`,
      label: "예수금",
      amount: int(10) === 0 ? -int(1_000_000) : int(5_000_000),
    })),
    note: "",
    color: "",
  }));

  const targets = TICKERS.filter(() => rand() < 0.5);
  const allocations = targets.map((ticker, i) => ({
    id: `al-${i}`,
    market: "KOSPI",
    ticker,
    name: "",
    currency: "KRW",
    targetPercent: Math.round((100 / targets.length) * 10) / 10,
  }));

  const growthStage = int(5);
  const progress = readPlantProgress({
    growthStage,
    goalHistory: Array.from({ length: growthStage }, () => ({ amount: 1, reachedAt: NOW })),
    goalAmount: rand() < 0.5 ? 1 + int(80_000_000) : null,
    stageGoals: rand() < 0.6 ? [1, 2, 3, 4, 5].map((k) => k * (1 + int(20_000_000))) : [],
    fruitGoal: growthStage === 4 && rand() < 0.2 ? { amount: 1, reachedAt: NOW } : null,
  });

  const linkedIds = accounts.filter(() => rand() < 0.8).map((a) => a.id);
  const portfolio = {
    ...progress,
    id: "p-1",
    name: "포트폴리오",
    color: "",
    allocations,
    accountIds: linkedIds,
    driftMode: pick(["relative", "absolute"] as const),
    driftThresholdPercent: pick([0, 3, 5, 15, 30]),
    note: "",
    createdAt: NOW,
    updatedAt: NOW,
  } as PortfolioItem;

  return { portfolio, accounts, prices };
}

function appAnswer({ portfolio, accounts, prices }: ReturnType<typeof randomCase>) {
  const evaluation = portfolioPlantEvaluation(portfolio, accounts, prices);
  const advanced = advancePlant(portfolio, evaluation, NOW);
  const grew =
    advanced.growthStage > portfolio.growthStage ||
    (advanced.fruitGoal !== null && portfolio.fruitGoal === null);
  return {
    // 연결 계좌가 없으면 서버는 알리지 않는다 (앱은 금액 0 으로 평가한다 — 목표가 양수라 자라지 않는다).
    reached: evaluation.accountCount > 0 && grew,
    value: evaluation.value,
    pricesComplete: evaluation.pricesComplete,
    drifting: evaluation.drifting,
  };
}

function serverAnswer({ portfolio, accounts, prices }: ReturnType<typeof randomCase>) {
  const linked: GoalCheckAccount[] = accounts
    .filter((a) => portfolio.accountIds.includes(a.id))
    .map((a) => ({ holdings: a.holdings, cashAmounts: a.cashItems.map((c) => c.amount) }));
  const result = checkPlantGoal(
    portfolio,
    linked,
    portfolio.allocations,
    portfolio,
    (market, ticker) => prices.get(`${market}:${ticker}`)?.close ?? null
  );
  return {
    reached: result.reached,
    value: result.value,
    pricesComplete: result.pricesComplete,
    drifting: result.drifting,
  };
}

describe("plant goal check (server) matches the app growth rule", () => {
  const rand = mulberry32(20261128);
  const cases = Array.from({ length: 500 }, () => randomCase(rand));

  it("covers reached, drifting and missing-price cases", () => {
    const answers = cases.map(appAnswer);
    expect(answers.some((a) => a.reached)).toBe(true);
    expect(answers.some((a) => a.drifting)).toBe(true);
    expect(answers.some((a) => !a.pricesComplete)).toBe(true);
  });

  it.each(cases.map((c, i) => [i, c] as const))("case %i", (_, c) => {
    expect(serverAnswer(c)).toEqual(appAnswer(c));
  });
});
