import { describe, expect, it } from "vitest";
import type { RebalancingTask, RebalancingTaskAction } from "../types/types";
import { groupTasksByStep } from "./group-tasks-by-step";

function task(
  id: string,
  action: RebalancingTaskAction,
  overrides: Partial<RebalancingTask> = {}
): RebalancingTask {
  return {
    id,
    market: "KOSPI",
    ticker: id,
    name: id,
    action,
    amount: 1000,
    price: 100,
    quantity: 10,
    priceAsOf: null,
    priceKind: null,
    done: false,
    ...overrides,
  };
}

const ids = (tasks: RebalancingTask[]) => tasks.map((t) => t.id);

describe("groupTasksByStep", () => {
  it("puts unfinished sells and buys in their own steps and finished trades last", () => {
    const tasks = [
      task("buy", "매수"),
      task("sold", "매도", { done: true }),
      task("sell", "매도"),
      task("orderedBuy", "매수", { orderedQuantity: 10, orderedPrice: 100 }),
    ];

    const groups = groupTasksByStep(tasks);

    expect(ids(groups.sell)).toEqual(["sell"]);
    expect(ids(groups.buy)).toEqual(["buy", "orderedBuy"]);
    expect(ids(groups.done)).toEqual(["sold"]);
  });

  it("keeps a just-finished trade in its step while it animates out", () => {
    const tasks = [task("sell", "매도", { done: true })];

    const groups = groupTasksByStep(tasks, new Set(["sell"]));

    expect(ids(groups.sell)).toEqual(["sell"]);
    expect(groups.done).toEqual([]);
  });
});
