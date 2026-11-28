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

const done = { done: true };

describe("nextRebalancingAction", () => {
  it("asks to sell first while a sell is still open", () => {
    const tasks = [task("buy", "매수", 10, 1000), task("sell", "매도", 5, 2000)];

    expect(nextRebalancingAction(tasks, 100_000)).toEqual({
      kind: "sell",
      task: tasks[1],
      amount: 10_000,
    });
  });

  it("keeps a partly sold sell as the next action for the shares left", () => {
    const tasks = [
      task("sell", "매도", 5, 2000, { filledQuantity: 3, filledAmount: 6_000 }),
      task("buy", "매수", 10, 1000),
    ];

    expect(nextRebalancingAction(tasks, 0)).toMatchObject({ kind: "sell", amount: 4_000 });
  });

  it("asks to buy once every sell is done and the cash covers the buy", () => {
    const tasks = [task("sell", "매도", 5, 2000, done), task("buy", "매수", 10, 1000)];

    expect(nextRebalancingAction(tasks, 10_000)).toEqual({
      kind: "buy",
      task: tasks[1],
      amount: 10_000,
      available: 10_000,
      shortfall: 0,
    });
  });

  it("asks to buy with the shortfall when the cash does not cover it", () => {
    const tasks = [task("sell", "매도", 5, 2000, done), task("buy", "매수", 10, 1000)];

    expect(nextRebalancingAction(tasks, 4_000)).toMatchObject({
      kind: "buy",
      task: tasks[1],
      shortfall: 6_000,
    });
  });

  it("treats an old unfilled order as still open", () => {
    const tasks = [task("sell", "매도", 5, 2000, { orderedQuantity: 5, orderedPrice: 2000 })];

    expect(nextRebalancingAction(tasks, 0)).toMatchObject({ kind: "sell", task: tasks[0] });
  });

  it("is done when every trade is done", () => {
    const tasks = [task("sell", "매도", 5, 2000, done)];

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
