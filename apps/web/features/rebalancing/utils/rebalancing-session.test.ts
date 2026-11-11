import { describe, expect, it } from "vitest";
import type { RebalancingSession, RebalancingTask } from "../types/types";
import {
  cancelRebalancingTaskOrder,
  canCompleteRebalancing,
  completeRebalancing,
  completeRebalancingTaskWith,
  executedPriceFor,
  executedPriceOf,
  executedQuantityOf,
  findInProgressForAccount,
  groupRebalancingTasks,
  inProgressAccountIds,
  isRebalancingStopped,
  orderRebalancingTaskWith,
  rebalancingProgress,
  rebalancingTaskStatus,
  toggleRebalancingTask,
  visibleRebalancingTasks,
} from "./rebalancing-session";

function task(id: string, done = false): RebalancingTask {
  return {
    id,
    market: "KOSPI",
    ticker: id,
    name: id,
    action: "매수",
    amount: 1000,
    price: null,
    quantity: null,
    priceAsOf: null,
    priceKind: null,
    done,
  };
}

function session(overrides: Partial<RebalancingSession> = {}): RebalancingSession {
  return {
    id: "s1",
    accountId: "acc",
    accountName: "연금",
    portfolioId: "p",
    portfolioName: "안정형",
    cashDelta: 0,
    tasks: [task("a"), task("b")],
    startedAt: "2026-11-01T00:00:00.000Z",
    completedAt: null,
    ...overrides,
  };
}

const NOW = "2026-11-08T09:00:00.000Z";

describe("toggleRebalancingTask", () => {
  it("marks a task done without completing while others remain", () => {
    const result = toggleRebalancingTask(session(), "a");

    expect(result.tasks.map((t) => t.done)).toEqual([true, false]);
    expect(result.completedAt).toBeNull();
  });

  it("keeps the rebalancing in progress when the last task is done", () => {
    const result = toggleRebalancingTask(session({ tasks: [task("a", true), task("b")] }), "b");

    expect(result.tasks.every((t) => t.done)).toBe(true);
    expect(result.completedAt).toBeNull();
  });

  it("ignores toggles on a completed rebalancing", () => {
    const completed = session({ tasks: [task("a", true), task("b", true)], completedAt: NOW });

    expect(toggleRebalancingTask(completed, "a")).toBe(completed);
  });

  it("returns the same session for an unknown task id", () => {
    const original = session();

    expect(toggleRebalancingTask(original, "missing")).toBe(original);
  });
});

describe("rebalancingProgress", () => {
  it("counts done tasks out of the total", () => {
    expect(rebalancingProgress(session({ tasks: [task("a", true), task("b")] }))).toEqual({
      done: 1,
      total: 2,
    });
  });
});

describe("findInProgressForAccount", () => {
  it("finds the in-progress rebalancing for the account and skips completed ones", () => {
    const done = session({ id: "done", completedAt: NOW });
    const active = session({ id: "active" });
    const other = session({ id: "other", accountId: "other-acc" });

    expect(findInProgressForAccount([done, other, active], "acc")?.id).toBe("active");
  });

  it("returns undefined when the account has nothing in progress", () => {
    expect(findInProgressForAccount([session({ completedAt: NOW })], "acc")).toBeUndefined();
  });
});

describe("visibleRebalancingTasks", () => {
  it("hides done tasks while the rebalancing is in progress", () => {
    const result = visibleRebalancingTasks(session({ tasks: [task("a", true), task("b")] }), false);

    expect(result.map((t) => t.id)).toEqual(["b"]);
  });

  it("shows every task when show-all is on", () => {
    const result = visibleRebalancingTasks(session({ tasks: [task("a", true), task("b")] }), true);

    expect(result.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("shows nothing once every task is checked, before completing", () => {
    const result = visibleRebalancingTasks(
      session({ tasks: [task("a", true), task("b", true)] }),
      false
    );

    expect(result).toEqual([]);
  });

  it("shows every task of a completed rebalancing even without show-all", () => {
    const result = visibleRebalancingTasks(
      session({ tasks: [task("a", true), task("b", true)], completedAt: NOW }),
      false
    );

    expect(result.map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("canCompleteRebalancing", () => {
  it("is true while tasks remain unchecked", () => {
    expect(canCompleteRebalancing(session({ tasks: [task("a", true), task("b")] }))).toBe(true);
  });

  it("is true when every task is done and it is still in progress", () => {
    expect(canCompleteRebalancing(session({ tasks: [task("a", true), task("b", true)] }))).toBe(
      true
    );
  });

  it("is false once completed", () => {
    expect(
      canCompleteRebalancing(
        session({ tasks: [task("a", true), task("b", true)], completedAt: NOW })
      )
    ).toBe(false);
  });
});

describe("completeRebalancing", () => {
  it("stamps completedAt when every task is done", () => {
    const result = completeRebalancing(session({ tasks: [task("a", true), task("b", true)] }), NOW);

    expect(result.completedAt).toBe(NOW);
  });

  it("stamps completedAt even with unchecked tasks, leaving them unchecked", () => {
    const result = completeRebalancing(session({ tasks: [task("a", true), task("b")] }), NOW);

    expect(result.completedAt).toBe(NOW);
    expect(result.tasks.map((t) => t.done)).toEqual([true, false]);
  });

  it("does nothing to an already completed rebalancing", () => {
    const completed = session({ completedAt: "2026-11-01T00:00:00.000Z" });

    expect(completeRebalancing(completed, NOW)).toBe(completed);
  });

  it("keeps the result snapshot taken when it was applied to the account", () => {
    const snapshot = { holdings: [], cash: 1_000, cashPercent: 100 };

    expect(completeRebalancing(session(), NOW, snapshot).result).toEqual(snapshot);
  });

  it("records no result when it was not applied to the account", () => {
    expect(completeRebalancing(session(), NOW).result).toBeNull();
  });
});

describe("inProgressAccountIds", () => {
  it("collects accounts that have a rebalancing in progress, skipping completed ones", () => {
    const sessions = [
      session({ id: "1", accountId: "acc-a" }),
      session({ id: "2", accountId: "acc-b", completedAt: NOW }),
    ];

    expect(inProgressAccountIds(sessions)).toEqual(new Set(["acc-a"]));
  });

  it("counts an account whose tasks are all checked but not yet completed", () => {
    const sessions = [session({ accountId: "acc-a", tasks: [task("a", true)] })];

    expect(inProgressAccountIds(sessions).has("acc-a")).toBe(true);
  });
});

describe("isRebalancingStopped", () => {
  it("is true for a completed rebalancing with unchecked tasks", () => {
    expect(
      isRebalancingStopped(session({ tasks: [task("a", true), task("b")], completedAt: NOW }))
    ).toBe(true);
  });

  it("is false when every task was done", () => {
    expect(
      isRebalancingStopped(session({ tasks: [task("a", true), task("b", true)], completedAt: NOW }))
    ).toBe(false);
  });

  it("is false while still in progress", () => {
    expect(isRebalancingStopped(session({ tasks: [task("a")] }))).toBe(false);
  });
});

describe("groupRebalancingTasks", () => {
  const ordered = (id: string) => ({ ...task(id), orderedQuantity: 3, orderedPrice: 1_000 });

  it("splits tasks into pending, ordered and filled, keeping their order", () => {
    const result = groupRebalancingTasks([task("a", true), ordered("b"), task("c"), ordered("d")]);

    expect(result.pending.map((t) => t.id)).toEqual(["c"]);
    expect(result.ordered.map((t) => t.id)).toEqual(["b", "d"]);
    expect(result.filled.map((t) => t.id)).toEqual(["a"]);
  });

  it("keeps a just-ordered task in pending while it animates out", () => {
    const result = groupRebalancingTasks([ordered("a"), task("b")], new Map([["a", "pending"]]));

    expect(result.pending.map((t) => t.id)).toEqual(["a", "b"]);
    expect(result.ordered).toEqual([]);
  });

  it("keeps a just-filled order in ordered while it animates out", () => {
    const filled = { ...ordered("a"), done: true };
    const result = groupRebalancingTasks([filled], new Map([["a", "ordered"]]));

    expect(result.ordered.map((t) => t.id)).toEqual(["a"]);
    expect(result.filled).toEqual([]);
  });

  it("returns empty groups for no tasks", () => {
    expect(groupRebalancingTasks([])).toEqual({ pending: [], ordered: [], filled: [] });
  });
});

describe("rebalancingTaskStatus", () => {
  it("is pending before an order is recorded", () => {
    expect(rebalancingTaskStatus(task("a"))).toBe("pending");
  });

  it("is ordered once an order quantity and price are recorded", () => {
    expect(rebalancingTaskStatus({ ...task("a"), orderedQuantity: 3, orderedPrice: 1_000 })).toBe(
      "ordered"
    );
  });

  it("is filled once done, whether or not it was ordered first", () => {
    expect(rebalancingTaskStatus(task("a", true))).toBe("filled");
  });
});

describe("orderRebalancingTaskWith", () => {
  it("records the order quantity and price, keeping the recommendation", () => {
    const result = orderRebalancingTaskWith(session(), "a", 4, 1_050);
    const ordered = result.tasks.find((t) => t.id === "a");

    expect(ordered).toMatchObject({ orderedQuantity: 4, orderedPrice: 1_050, done: false });
    expect(ordered?.amount).toBe(1000);
  });

  it("does not change a filled task", () => {
    const s = session({ tasks: [task("a", true)] });
    expect(orderRebalancingTaskWith(s, "a", 4, 1_050)).toBe(s);
  });

  it("does not change a completed rebalancing", () => {
    const s = session({ completedAt: NOW });
    expect(orderRebalancingTaskWith(s, "a", 4, 1_050)).toBe(s);
  });
});

describe("cancelRebalancingTaskOrder", () => {
  it("returns an ordered task to pending", () => {
    const ordered = orderRebalancingTaskWith(session(), "a", 4, 1_050);
    const result = cancelRebalancingTaskOrder(ordered, "a");

    expect(rebalancingTaskStatus(result.tasks[0]!)).toBe("pending");
  });

  it("does not change a filled task", () => {
    const s = session({ tasks: [{ ...task("a", true), orderedQuantity: 4, orderedPrice: 1_050 }] });
    expect(cancelRebalancingTaskOrder(s, "a")).toBe(s);
  });
});

describe("unfilling a task (toggleRebalancingTask on a filled task)", () => {
  it("returns it to ordered when it had been ordered", () => {
    const s = session({ tasks: [{ ...task("a", true), orderedQuantity: 4, orderedPrice: 1_050 }] });
    expect(rebalancingTaskStatus(toggleRebalancingTask(s, "a").tasks[0]!)).toBe("ordered");
  });
});

describe("completeRebalancingTaskWith", () => {
  const planned = { ...task("a"), quantity: 54, price: 104_010 };

  it("marks the task done with the quantity actually traded, keeping the recommendation", () => {
    const result = completeRebalancingTaskWith(session({ tasks: [planned] }), "a", 50);

    expect(result.tasks[0]).toMatchObject({ done: true, quantity: 54, executedQuantity: 50 });
  });

  it("records the price actually traded at, keeping the snapshot price", () => {
    const result = completeRebalancingTaskWith(session({ tasks: [planned] }), "a", 50, 103_500);

    expect(result.tasks[0]).toMatchObject({ price: 104_010, executedPrice: 103_500 });
  });

  it("changes the recorded quantity of a task that is already done", () => {
    const done = completeRebalancingTaskWith(session({ tasks: [planned] }), "a", 50);

    const result = completeRebalancingTaskWith(done, "a", 54);

    expect(result.tasks[0]).toMatchObject({ done: true, executedQuantity: 54 });
  });

  it("does not change a completed rebalancing", () => {
    const completed = session({ tasks: [planned], completedAt: NOW });

    expect(completeRebalancingTaskWith(completed, "a", 50)).toBe(completed);
  });

  it("ignores an unknown task", () => {
    const s = session({ tasks: [planned] });

    expect(completeRebalancingTaskWith(s, "nope", 50)).toBe(s);
  });
});

describe("executedQuantityOf", () => {
  it("is null for a task that is not done", () => {
    expect(executedQuantityOf({ ...task("a"), quantity: 54 })).toBeNull();
  });

  it("is the quantity actually traded once recorded", () => {
    expect(executedQuantityOf({ ...task("a", true), quantity: 54, executedQuantity: 50 })).toBe(50);
  });

  it("treats a task checked without a quantity as traded at the recommendation", () => {
    expect(executedQuantityOf({ ...task("a", true), quantity: 54 })).toBe(54);
  });
});

describe("executedPriceOf", () => {
  it("is null for a task that is not done", () => {
    expect(executedPriceOf({ ...task("a"), price: 104_010 })).toBeNull();
  });

  it("is the price actually traded at once recorded", () => {
    expect(executedPriceOf({ ...task("a", true), price: 104_010, executedPrice: 103_500 })).toBe(
      103_500
    );
  });

  it("treats a task checked without a price as traded at the snapshot price", () => {
    expect(executedPriceOf({ ...task("a", true), price: 104_010 })).toBe(104_010);
  });
});

describe("executedPriceFor", () => {
  const traded = (id: string, ticker: string, price: number, executedPrice?: number) => ({
    ...task(id, true),
    ticker,
    price,
    executedPrice,
  });

  it("is the traded price of the stock's done task", () => {
    const tasks = [traded("a", "A", 10_000, 10_050), traded("b", "B", 20_000)];

    expect(executedPriceFor(tasks, "KOSPI", "A")).toBe(10_050);
    expect(executedPriceFor(tasks, "KOSPI", "B")).toBe(20_000);
  });

  it("is null for a stock that was not traded", () => {
    const tasks = [{ ...task("a"), ticker: "A", price: 10_000 }];

    expect(executedPriceFor(tasks, "KOSPI", "A")).toBeNull();
    expect(executedPriceFor(tasks, "KOSPI", "Z")).toBeNull();
  });
});
