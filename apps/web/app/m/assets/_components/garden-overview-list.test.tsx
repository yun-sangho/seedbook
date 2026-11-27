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
        onOpenPortfolio={noop}
        onPlantFirstSeed={onPlantFirstSeed}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "첫 씨앗 심기" }));

    expect(onPlantFirstSeed).toHaveBeenCalled();
  });

  it("opens the portfolio of a tapped row", () => {
    const onOpenPortfolio = vi.fn();
    render(
      <GardenOverviewList
        plants={[plant({ rebalancing: "needs-rebalancing" })]}
        portfolios={[]}
        investments={[]}
        onOpenPortfolio={onOpenPortfolio}
        onPlantFirstSeed={noop}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "안정형 포트폴리오 보기" }));

    expect(onOpenPortfolio).toHaveBeenCalledWith("p1");
    expect(screen.getByRole("img", { name: "리밸런싱 필요" })).toBeTruthy();
    expect(screen.getByText("연결 계좌 없음")).toBeTruthy();
  });

  it("shows a reached goal in the caption without a goal button", () => {
    render(
      <GardenOverviewList
        plants={[plant({ goalState: "needs-goal", goalAmount: null })]}
        portfolios={[]}
        investments={[]}
        onOpenPortfolio={noop}
        onPlantFirstSeed={noop}
      />
    );

    expect(screen.getByText("새싹 · 목표 달성!")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "안정형 목표 정하기" })).toBeNull();
  });

  it("shows the value and return rate of a linked portfolio", () => {
    const account = {
      id: "a1",
      accountName: "ISA",
      accountType: "ISA 계좌",
      currency: "KRW",
      initialInvestment: 10_000_000,
      currentValue: 11_000_000,
      records: [],
      holdings: [],
      cashItems: [],
      note: "",
      color: "#000",
    } as const;
    render(
      <GardenOverviewList
        plants={[plant({ value: 11_000_000 })]}
        portfolios={[{ id: "p1", accountIds: ["a1"] } as never]}
        investments={[account as never]}
        onOpenPortfolio={noop}
        onPlantFirstSeed={noop}
      />
    );

    const row = screen.getByRole("button", { name: "안정형 포트폴리오 보기" });
    expect(row.textContent).toContain("1,100만원");
    expect(row.textContent).toContain("+10.00%");
  });
});
