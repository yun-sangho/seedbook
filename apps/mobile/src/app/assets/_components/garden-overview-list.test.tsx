import { useHarvestStore } from "@mobile/features/garden/stores/harvest-store";
import type { HarvestItem } from "@mobile/features/portfolio/utils/plant-season";
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
    kind: "tree",
    season: 1,
    wish: "",
    value: 0,
    pricesComplete: true,
    rebalancing: "unknown",
    stage: 1,
    goalState: "set",
    goalAmount: 1_000_000,
    remainingToNextStage: 1_000_000,
    drifting: false,
    driftDays: 0,
    wilt: 0,
    wind: 0,
    ripe: false,
    changed: false,
    ...partial,
  };
}

const noop = () => {};

const harvest: HarvestItem = {
  id: "h1",
  sourceType: "portfolio",
  sourceId: "p1",
  sourceName: "안정형",
  season: 1,
  plantKind: "tree",
  wish: "부모님과 제주 여행",
  goals: [{ amount: 1_000_000, reachedAt: "2026-11-01T00:00:00.000Z" }],
  harvestedAt: "2026-11-27T00:00:00.000Z",
  doneAt: null,
};

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
    expect(screen.getByRole("img", { name: "이격 초과" })).toBeTruthy();
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

  it("names a wilting plant and the wind next to the stage", () => {
    renderRow({ wilt: 0.7, wind: 0.2 });

    const row = screen.getByRole("button", { name: "안정형 포트폴리오 보기" });
    expect(row.textContent).toContain("새싹 · 시들해요 · 바람이 불어요");
  });

  it("names a ferns' stages", () => {
    renderRow({ kind: "fern", stage: 3 });

    expect(screen.getByRole("button", { name: "안정형 포트폴리오 보기" }).textContent).toContain(
      "고사리"
    );
  });

  it("hides the basket until something is harvested", () => {
    useHarvestStore.setState({ harvests: [] });
    renderRow({});

    expect(screen.queryByRole("button", { name: /바구니/ })).toBeNull();
  });

  it("opens the basket and marks a wish as done", () => {
    useHarvestStore.setState({ harvests: [harvest] });
    renderRow({});

    fireEvent.click(screen.getByRole("button", { name: /바구니 1/ }));
    expect(screen.getByText("부모님과 제주 여행")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "부모님과 제주 여행 했어요" }));

    expect(useHarvestStore.getState().harvests[0]?.doneAt).not.toBeNull();
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
