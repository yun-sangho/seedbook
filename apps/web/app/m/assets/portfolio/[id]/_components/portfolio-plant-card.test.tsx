import { render, screen } from "@testing-library/react";
import type { PlantStatus } from "@web/features/portfolio/utils/portfolio-plant";
import { describe, expect, it } from "vitest";
import { PortfolioPlantCard } from "./portfolio-plant-card";

const status: PlantStatus = {
  stage: 1,
  drooping: false,
  goalState: "set",
  goalAmount: 10_000_000,
  remainingToNextStage: 2_000_000,
  grew: false,
};

describe("PortfolioPlantCard", () => {
  it("shows the portfolio's plant at a recognizable size", () => {
    const { container } = render(
      <PortfolioPlantCard
        portfolioId="p1"
        status={status}
        needsRebalance={false}
        onEdit={() => {}}
      />
    );
    expect(container.querySelector("svg")?.getAttribute("width")).toBe("72");
  });

  it("marks the plant with the garden's ! when rebalancing is needed", () => {
    render(
      <PortfolioPlantCard portfolioId="p1" status={status} needsRebalance onEdit={() => {}} />
    );
    expect(screen.getByRole("img", { name: "리밸런싱 필요" })).toBeTruthy();
  });

  it("shows no ! when the portfolio is on target", () => {
    render(
      <PortfolioPlantCard
        portfolioId="p1"
        status={status}
        needsRebalance={false}
        onEdit={() => {}}
      />
    );
    expect(screen.queryByRole("img", { name: "리밸런싱 필요" })).toBeNull();
  });
});
