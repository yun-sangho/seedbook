import { describe, expect, it } from "vitest";
import type { RebalancingTask } from "../types/types";
import {
  DEFAULT_REBALANCING_TASK_SORT,
  isRebalancingTaskSort,
  type RebalancingTaskSort,
  sortRebalancingTasks,
} from "./sort-rebalancing-tasks";

function task(
  name: string,
  action: RebalancingTask["action"],
  overrides: Partial<RebalancingTask> = {}
): RebalancingTask {
  return {
    id: name,
    market: "KOSPI",
    ticker: name,
    name,
    action,
    amount: 0,
    price: 1_000,
    quantity: 1,
    priceAsOf: null,
    priceKind: null,
    done: false,
    ...overrides,
  };
}

const names = (tasks: RebalancingTask[]) => tasks.map((t) => t.name);

describe("sortRebalancingTasks", () => {
  it("기본 정렬은 이름 내림차순이다", () => {
    expect(DEFAULT_REBALANCING_TASK_SORT).toBe("nameDesc");
  });

  // 시작할 때 계산된 순서 (매도 → 매수, 금액 큰 순)
  const tasks = [
    task("KODEX 미국S&P500", "매도", { amount: 500 }),
    task("TIGER CD금리투자KIS(합성)", "매도", { amount: 300 }),
    task("삼성전자", "매수", { amount: 900 }),
    task("ACE KRX금현물", "매수", { amount: 700 }),
    task("TIGER 미국채10년선물", "매수", { amount: 100 }),
  ];
  // 지금 보유 수량 (평가액 = 보유 수량 × 기준 가격 1,000원)
  const held: Record<string, number> = {
    "KODEX 미국S&P500": 10,
    "TIGER CD금리투자KIS(합성)": 50,
    삼성전자: 30,
    "ACE KRX금현물": 0,
    "TIGER 미국채10년선물": 80,
  };
  const holding = (t: RebalancingTask) => held[t.name] ?? 0;

  it("이름 오름차순: 매도 먼저, 그 안에서 영문 A→Z 다음 한글 (한글이 더 큰 값)", () => {
    expect(names(sortRebalancingTasks(tasks, "nameAsc", holding))).toEqual([
      "KODEX 미국S&P500",
      "TIGER CD금리투자KIS(합성)",
      "ACE KRX금현물",
      "TIGER 미국채10년선물",
      "삼성전자",
    ]);
  });

  it("이름 내림차순: 매도 먼저, 그 안에서 오름차순을 거꾸로", () => {
    expect(names(sortRebalancingTasks(tasks, "nameDesc", holding))).toEqual([
      "TIGER CD금리투자KIS(합성)",
      "KODEX 미국S&P500",
      "삼성전자",
      "TIGER 미국채10년선물",
      "ACE KRX금현물",
    ]);
  });

  it("이름에서 처음 다른 글자가 한글과 영문이면 한글이 더 큰 값이다", () => {
    const tigers = [
      task("TIGER 미국채10년선물", "매수"),
      task("TIGER CD금리투자KIS(합성)", "매수"),
    ];

    expect(names(sortRebalancingTasks(tigers, "nameAsc", holding))).toEqual([
      "TIGER CD금리투자KIS(합성)",
      "TIGER 미국채10년선물",
    ]);
    expect(names(sortRebalancingTasks(tigers, "nameDesc", holding))).toEqual([
      "TIGER 미국채10년선물",
      "TIGER CD금리투자KIS(합성)",
    ]);
  });

  it("이름 속 숫자는 값으로 비교한다", () => {
    const numbered = [task("KODEX 200", "매수"), task("KODEX 50", "매수")];

    expect(names(sortRebalancingTasks(numbered, "nameAsc", holding))).toEqual([
      "KODEX 50",
      "KODEX 200",
    ]);
  });

  it("평가액 높은 순: 매도 먼저, 그 안에서 보유 수량 × 기준 가격이 큰 순", () => {
    expect(names(sortRebalancingTasks(tasks, "evalDesc", holding))).toEqual([
      "TIGER CD금리투자KIS(합성)",
      "KODEX 미국S&P500",
      "TIGER 미국채10년선물",
      "삼성전자",
      "ACE KRX금현물",
    ]);
  });

  it("평가액 낮은 순: 매도 먼저, 그 안에서 작은 순", () => {
    expect(names(sortRebalancingTasks(tasks, "evalAsc", holding))).toEqual([
      "KODEX 미국S&P500",
      "TIGER CD금리투자KIS(합성)",
      "ACE KRX금현물",
      "삼성전자",
      "TIGER 미국채10년선물",
    ]);
  });

  it("어떤 정렬이든 매도가 매수보다 먼저 나온다", () => {
    const options: RebalancingTaskSort[] = ["nameAsc", "nameDesc", "evalDesc", "evalAsc"];
    const mixed = [...tasks].reverse(); // 매수가 앞에 오도록 섞는다
    for (const option of options) {
      const actions = sortRebalancingTasks(mixed, option, holding).map((t) => t.action);
      expect(actions.lastIndexOf("매도"), option).toBeLessThan(actions.indexOf("매수"));
    }
  });

  it("기준 가격을 모르면 평가액을 0 으로 본다", () => {
    const unpriced = [task("A", "매수", { price: null }), task("B", "매수")];

    expect(names(sortRebalancingTasks(unpriced, "evalDesc", () => 10))).toEqual(["B", "A"]);
  });

  it("값이 같으면 원래 순서를 지키고, 원래 배열은 바꾸지 않는다", () => {
    const ties = [task("X", "매수"), task("Y", "매수")];
    const copy = [...ties];

    expect(names(sortRebalancingTasks(ties, "evalDesc", () => 1))).toEqual(["X", "Y"]);
    expect(ties).toEqual(copy);
  });
});

describe("isRebalancingTaskSort", () => {
  it("accepts the four sort options", () => {
    for (const value of ["nameDesc", "nameAsc", "evalDesc", "evalAsc"]) {
      expect(isRebalancingTaskSort(value), value).toBe(true);
    }
  });

  it("rejects anything else (removed options, other types)", () => {
    for (const value of ["default", "driftDesc", "tradeDesc", "", null, 1, undefined]) {
      expect(isRebalancingTaskSort(value), String(value)).toBe(false);
    }
  });
});
