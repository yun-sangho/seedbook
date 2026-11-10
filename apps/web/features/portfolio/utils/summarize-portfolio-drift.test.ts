import { describe, expect, it } from "vitest";
import type { LinkedPortfolioStatus } from "./linked-portfolio-status";
import { summarizePortfolioDrift } from "./summarize-portfolio-drift";

function status(state: LinkedPortfolioStatus["state"]): LinkedPortfolioStatus {
  return {
    portfolioId: "p",
    name: "안정형",
    color: "#111",
    state,
    breachedCount: 0,
    maxAbsGapPercent: 0,
  };
}

describe("summarizePortfolioDrift", () => {
  it("counts accounts over and within the drift threshold", () => {
    const summary = summarizePortfolioDrift([
      status("needs-rebalancing"),
      status("needs-rebalancing"),
      status("ok"),
    ]);

    expect(summary).toEqual({ breachedCount: 2, okCount: 1 });
  });

  it("leaves accounts that cannot be judged out of both counts", () => {
    expect(summarizePortfolioDrift([status("unknown"), null])).toEqual({
      breachedCount: 0,
      okCount: 0,
    });
  });

  it("returns empty counts for no linked accounts", () => {
    expect(summarizePortfolioDrift([])).toEqual({ breachedCount: 0, okCount: 0 });
  });
});
