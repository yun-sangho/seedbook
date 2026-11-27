import { render, screen } from "@testing-library/react";
import type { PortfolioItem } from "@web/features/portfolio/types/types";
import type { PortfolioDriftSummary } from "@web/features/portfolio/utils/summarize-portfolio-drift";
import { describe, expect, it } from "vitest";
import { PortfolioDriftRow } from "./portfolio-drift-card";

const rule = { driftMode: "absolute", driftThresholdPercent: 15 } as PortfolioItem;
const summary = (partial: Partial<PortfolioDriftSummary>) =>
  ({ breachedCount: 0, okCount: 0, ...partial }) as PortfolioDriftSummary;
const noop = () => {};

describe("PortfolioDriftRow", () => {
  it("shows the rule briefly", () => {
    render(
      <PortfolioDriftRow portfolio={rule} summary={summary({})} linkedCount={0} onEdit={noop} />
    );
    expect(screen.getByText("±15%p")).toBeTruthy();
  });

  it("flags accounts that need rebalancing with a short badge", () => {
    render(
      <PortfolioDriftRow
        portfolio={rule}
        summary={summary({ breachedCount: 2 })}
        linkedCount={3}
        onEdit={noop}
      />
    );
    expect(screen.getByText("리밸런싱 필요 2")).toBeTruthy();
  });

  it("says all is well when every linked account is within the rule", () => {
    render(
      <PortfolioDriftRow
        portfolio={rule}
        summary={summary({ okCount: 2 })}
        linkedCount={2}
        onEdit={noop}
      />
    );
    expect(screen.getByText("정상")).toBeTruthy();
  });
});
