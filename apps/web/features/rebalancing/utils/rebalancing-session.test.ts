import { describe, expect, it } from "vitest";
import type { RebalancingSession, RebalancingTask } from "../types/types";
import {
  findInProgressForAccount,
  rebalancingProgress,
  toggleRebalancingTask,
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
    const result = toggleRebalancingTask(session(), "a", NOW);

    expect(result.tasks.map((t) => t.done)).toEqual([true, false]);
    expect(result.completedAt).toBeNull();
  });

  it("completes the rebalancing when the last task is done", () => {
    const result = toggleRebalancingTask(
      session({ tasks: [task("a", true), task("b")] }),
      "b",
      NOW
    );

    expect(result.completedAt).toBe(NOW);
  });

  it("reopens a completed rebalancing when a task is unchecked", () => {
    const completed = session({ tasks: [task("a", true), task("b", true)], completedAt: NOW });

    const result = toggleRebalancingTask(completed, "a", "2026-11-09T00:00:00.000Z");

    expect(result.completedAt).toBeNull();
  });

  it("returns the same session for an unknown task id", () => {
    const original = session();

    expect(toggleRebalancingTask(original, "missing", NOW)).toBe(original);
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
