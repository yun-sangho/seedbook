import { describe, expect, it } from "vitest";
import type { RebalancingSession, RebalancingTask } from "../types/types";
import {
  canCompleteRebalancing,
  completeRebalancing,
  completeRebalancingTaskWith,
  executedQuantityOf,
  findInProgressForAccount,
  groupRebalancingTasks,
  inProgressAccountIds,
  isRebalancingStopped,
  rebalancingProgress,
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
  it("puts unchecked tasks in remaining and checked ones in done, keeping their order", () => {
    const result = groupRebalancingTasks([task("a", true), task("b"), task("c", true)]);

    expect(result.remaining.map((t) => t.id)).toEqual(["b"]);
    expect(result.done.map((t) => t.id)).toEqual(["a", "c"]);
  });

  it("keeps a just-checked task in remaining while it animates out", () => {
    const result = groupRebalancingTasks([task("a", true), task("b")], new Set(["a"]));

    expect(result.remaining.map((t) => t.id)).toEqual(["a", "b"]);
    expect(result.done).toEqual([]);
  });

  it("ignores leaving ids for tasks that are no longer checked", () => {
    const result = groupRebalancingTasks([task("a"), task("b")], new Set(["a"]));

    expect(result.remaining.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("returns empty groups for no tasks", () => {
    expect(groupRebalancingTasks([])).toEqual({ remaining: [], done: [] });
  });
});

describe("completeRebalancingTaskWith", () => {
  const planned = { ...task("a"), quantity: 54, price: 104_010 };

  it("marks the task done with the quantity actually traded, keeping the recommendation", () => {
    const result = completeRebalancingTaskWith(session({ tasks: [planned] }), "a", 50);

    expect(result.tasks[0]).toMatchObject({ done: true, quantity: 54, executedQuantity: 50 });
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
