import type { PortfolioPlantView } from "@mobile/features/portfolio/utils/portfolio-plant-view";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GardenOverviewList } from "./garden-overview-list";

const push = vi.fn();
vi.mock("@stackflow/react", () => ({ useFlow: () => ({ push }) }));
vi.mock("@mobile/app/_stack/stack-control", () => ({ switchTab: vi.fn() }));

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

  function renderRow(partial: Partial<PortfolioPlantView>) {
    render(
      <GardenOverviewList
        plants={[plant(partial)]}
        portfolios={[]}
        investments={[]}
        onOpenPortfolio={noop}
        onPlantFirstSeed={noop}
      />
    );
  }

  it("shows the growth stage next to the name", () => {
    renderRow({ stage: 0, goalState: "needs-goal", goalAmount: null });

    const row = screen.getByRole("button", { name: "안정형 포트폴리오 보기" });
    expect(row.textContent).toContain("안정형씨앗");
  });

  it("fills the goal bar with the progress toward the goal", () => {
    renderRow({ value: 750_000, goalAmount: 1_000_000 });

    const bar = screen.getByRole("progressbar", { name: "안정형 목표 도달" });
    expect(bar.getAttribute("aria-valuenow")).toBe("75");
    expect(screen.queryByText("75%")).toBeNull();
  });

  it("shows no bar, only a hint, under a seed without a goal", () => {
    renderRow({ stage: 0, goalState: "needs-goal", goalAmount: null });

    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByText("목표를 정하면 자라요")).toBeTruthy();
  });

  it("fills the bar when the goal was just reached", () => {
    renderRow({ stage: 1, goalState: "needs-goal", goalAmount: null });

    expect(
      screen.getByRole("progressbar", { name: "안정형 목표 도달" }).getAttribute("aria-valuenow")
    ).toBe("100");
    expect(screen.getByText("목표 달성!")).toBeTruthy();
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
