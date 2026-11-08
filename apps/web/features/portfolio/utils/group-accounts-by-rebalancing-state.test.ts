import { describe, expect, it } from "vitest";
import {
  accountRebalancingState,
  groupAccountsByRebalancingState,
} from "./group-accounts-by-rebalancing-state";
import type { LinkedPortfolioState, LinkedPortfolioStatus } from "./linked-portfolio-status";

function status(state: LinkedPortfolioState, portfolioId = state): LinkedPortfolioStatus {
  return {
    portfolioId,
    name: portfolioId,
    color: "#111",
    state,
    breachedCount: 0,
    maxAbsGapPercent: 0,
  };
}

describe("accountRebalancingState", () => {
  it("is unlinked when no portfolio links to the account", () => {
    expect(accountRebalancingState(null)).toBe("unlinked");
  });

  it("follows the linked portfolio's state", () => {
    expect(accountRebalancingState(status("needs-rebalancing"))).toBe("needs-rebalancing");
    expect(accountRebalancingState(status("ok"))).toBe("ok");
    expect(accountRebalancingState(status("unknown"))).toBe("unknown");
  });
});

describe("groupAccountsByRebalancingState", () => {
  const rows = [
    { id: "ok-1", status: status("ok") },
    { id: "unlinked-1", status: null },
    { id: "bad-1", status: status("needs-rebalancing") },
    { id: "unknown-1", status: status("unknown") },
    { id: "bad-2", status: status("needs-rebalancing") },
  ];

  it("orders groups: needs rebalancing, ok, unknown, unlinked — keeping account order inside", () => {
    const groups = groupAccountsByRebalancingState(rows);

    expect(groups.map((g) => [g.state, g.rows.map((r) => r.id)])).toEqual([
      ["needs-rebalancing", ["bad-1", "bad-2"]],
      ["ok", ["ok-1"]],
      ["unknown", ["unknown-1"]],
      ["unlinked", ["unlinked-1"]],
    ]);
  });

  it("omits empty groups", () => {
    const groups = groupAccountsByRebalancingState([{ id: "ok-1", status: status("ok") }]);

    expect(groups.map((g) => g.state)).toEqual(["ok"]);
  });
});
