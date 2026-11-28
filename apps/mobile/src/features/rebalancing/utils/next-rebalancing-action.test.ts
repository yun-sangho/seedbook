import { describe, expect, it } from "vitest";
import type { RebalancingTask, RebalancingTaskAction } from "../types/types";
import { nextRebalancingAction } from "./next-rebalancing-action";

function task(
  id: string,
  action: RebalancingTaskAction,
  quantity: number,
  price: number,
  overrides: Partial<RebalancingTask> = {}
): RebalancingTask {
  return {
    id,
    market: "KOSPI",
    ticker: id,
    name: id,
    action,
    amount: quantity * price,
    price,
    quantity,
    priceAsOf: null,
    priceKind: null,
    done: false,
    ...overrides,
  };
}

const ordered = (quantity: number, price: number) => ({
  orderedQuantity: quantity,
  orderedPrice: price,
});

describe("nextRebalancingAction", () => {
  it("asks to sell first while a sell has not been ordered", () => {
    const tasks = [task("buy", "매수", 10, 1000), task("sell", "매도", 5, 2000)];

    expect(nextRebalancingAction(tasks, 100_000)).toEqual({
      kind: "sell",
      task: tasks[1],
      amount: 10_000,
    });
  });

  it("asks to buy once every sell is ordered and the cash covers the buy", () => {
    const tasks = [task("sell", "매도", 5, 2000, ordered(5, 2000)), task("buy", "매수", 10, 1000)];

    expect(nextRebalancingAction(tasks, 10_000)).toEqual({
      kind: "buy",
      task: tasks[1],
      amount: 10_000,
      available: 10_000,
      shortfall: 0,
    });
  });

  it("waits for sale proceeds when a buy needs more cash and a sell is still unfilled", () => {
    const tasks = [task("sell", "매도", 5, 2000, ordered(5, 2000)), task("buy", "매수", 10, 1000)];

    expect(nextRebalancingAction(tasks, 4_000)).toEqual({
      kind: "wait",
      reason: "proceeds",
      task: tasks[0],
      shortfall: 6_000,
    });
  });

  it("asks to buy with the shortfall when no sell can bring in more cash", () => {
    const tasks = [task("sell", "매도", 5, 2000, { done: true }), task("buy", "매수", 10, 1000)];

    expect(nextRebalancingAction(tasks, 4_000)).toEqual({
      kind: "buy",
      task: tasks[1],
      amount: 10_000,
      available: 4_000,
      shortfall: 6_000,
    });
  });

  it("waits for fills when every remaining trade is ordered", () => {
    const tasks = [
      task("sell", "매도", 5, 2000, { done: true }),
      task("buy", "매수", 10, 1000, ordered(10, 1000)),
    ];

    expect(nextRebalancingAction(tasks, 0)).toEqual({
      kind: "wait",
      reason: "fill",
      task: tasks[1],
      shortfall: 0,
    });
  });

  it("is done when every trade is filled", () => {
    const tasks = [task("sell", "매도", 5, 2000, { done: true })];

    expect(nextRebalancingAction(tasks, 0)).toEqual({ kind: "done" });
  });

  it("does not block a buy when the cash is unknown", () => {
    const tasks = [task("buy", "매수", 10, 1000)];

    expect(nextRebalancingAction(tasks, null)).toMatchObject({ kind: "buy", shortfall: 0 });
  });

  it("uses the recommended amount for a trade without a price", () => {
    const tasks = [task("sell", "매도", 0, 0, { price: null, quantity: null, amount: 7_000 })];

    expect(nextRebalancingAction(tasks, 0)).toMatchObject({ kind: "sell", amount: 7_000 });
  });
});
