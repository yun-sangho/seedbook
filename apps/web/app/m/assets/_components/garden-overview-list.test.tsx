import { fireEvent, render, screen } from "@testing-library/react";
import type { PortfolioPlantView } from "@web/features/portfolio/utils/portfolio-plant-view";
import { describe, expect, it, vi } from "vitest";
import { GardenOverviewList } from "./garden-overview-list";

const push = vi.fn();
vi.mock("@stackflow/react", () => ({ useFlow: () => ({ push }) }));
vi.mock("@web/app/m/_stack/stack-control", () => ({ switchTab: vi.fn() }));

function plant(partial: Partial<PortfolioPlantView>): PortfolioPlantView {
  return {
    portfolioId: "p1",
    name: "안정형",
    color: "#111",
    value: 0,
    pricesComplete: true,
    rebalancing: "unknown",
    stage: 1,
    drooping: false,
    goalState: "set",
    goalAmount: 1_000_000,
    remainingToNextStage: 1_000_000,
    grew: false,
    ...partial,
  };
}

const noop = () => {};

describe("GardenOverviewList", () => {
  it("offers to plant the first seed when there are no portfolios", () => {
    const onPlantFirstSeed = vi.fn();
    render(
      <GardenOverviewList
        plants={[]}
        portfolios={[]}
        investments={[]}
        onFocus={noop}
        onSetGoal={noop}
        onPlantFirstSeed={onPlantFirstSeed}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "첫 씨앗 심기" }));

    expect(onPlantFirstSeed).toHaveBeenCalled();
  });

  it("focuses the plant of a tapped row", () => {
    const onFocus = vi.fn();
    render(
      <GardenOverviewList
        plants={[plant({ rebalancing: "needs-rebalancing" })]}
        portfolios={[]}
        investments={[]}
        onFocus={onFocus}
        onSetGoal={noop}
        onPlantFirstSeed={noop}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "안정형 식물 보기" }));

    expect(onFocus).toHaveBeenCalledWith("p1");
    expect(screen.getByRole("img", { name: "리밸런싱 필요" })).toBeTruthy();
    expect(screen.getByText("연결 계좌 없음")).toBeTruthy();
  });

  it("asks for the next goal on a plant without one", () => {
    const onSetGoal = vi.fn();
    render(
      <GardenOverviewList
        plants={[plant({ goalState: "needs-goal", goalAmount: null })]}
        portfolios={[]}
        investments={[]}
        onFocus={noop}
        onSetGoal={onSetGoal}
        onPlantFirstSeed={noop}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "안정형 목표 정하기" }));

    expect(onSetGoal).toHaveBeenCalledWith("p1");
    expect(screen.getByText("새싹 · 목표 달성!")).toBeTruthy();
  });
});
