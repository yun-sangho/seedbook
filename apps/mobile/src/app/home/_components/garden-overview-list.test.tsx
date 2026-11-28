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
    plantName: "",
    wish: "",
    wishHistory: [],
    value: 0,
    pricesComplete: true,
    rebalancing: "unknown",
    stage: 1,
    goalState: "set",
    goalAmount: 1_000_000,
    finalGoalAmount: 1_000_000,
    goalPercent: 0,
    remainingToNextStage: 1_000_000,
    drifting: false,
    driftDays: 0,
    wilt: 0,
    rain: 0,
    ripe: false,
    empty: false,
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
  plantName: "",
  wishHistory: [],
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

    fireEvent.click(screen.getByRole("button", { name: "포트폴리오 만들기" }));

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
    renderRow({ stage: 0, goalAmount: 1_000_000 });

    const row = screen.getByRole("button", { name: "안정형 포트폴리오 보기" });
    expect(row.textContent).toContain("안정형씨앗");
  });

  it("shows an empty pot for a portfolio without a goal", () => {
    renderRow({ stage: 0, goalState: "needs-goal", goalAmount: null, empty: true });

    const row = screen.getByRole("button", { name: "안정형 포트폴리오 보기" });
    expect(row.textContent).toContain("안정형빈 화분");
  });

  it("fills the goal bar with the progress toward the goal", () => {
    renderRow({ value: 750_000, goalAmount: 900_000, finalGoalAmount: 1_000_000, goalPercent: 75 });

    const bar = screen.getByRole("progressbar", { name: "안정형 목표 도달" });
    expect(bar.getAttribute("aria-valuenow")).toBe("75");
    expect(screen.queryByText("75%")).toBeNull();
  });

  it("shows no bar, only a hint, under a seed without a goal", () => {
    renderRow({ stage: 0, goalState: "needs-goal", goalAmount: null });

    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByText("목표를 더하면 씨앗을 심어요")).toBeTruthy();
  });

  it("fills the bar when the goal was just reached", () => {
    renderRow({ stage: 1, goalState: "needs-goal", goalAmount: null });

    expect(
      screen.getByRole("progressbar", { name: "안정형 목표 도달" }).getAttribute("aria-valuenow")
    ).toBe("100");
    expect(screen.getByText("목표 달성!")).toBeTruthy();
  });

  it("names a wilting plant and the rain next to the stage", () => {
    renderRow({ wilt: 0.7, rain: 0.2 });

    const row = screen.getByRole("button", { name: "안정형 포트폴리오 보기" });
    expect(row.textContent).toContain("새싹 · 시들해요 · 비가 와요");
  });

  it("names the rain once, not again beside the bar", () => {
    renderRow({ rain: 0.2 });

    const row = screen.getByRole("button", { name: "안정형 포트폴리오 보기" });
    expect(row.textContent?.match(/비가 와요/g)).toHaveLength(1);
  });

  it("gives the plant name and portfolio name their own line, apart from the stage", () => {
    renderRow({ plantName: "몽글이", rain: 1, wilt: 1 });

    const title = screen.getByText("몽글이 · 안정형");
    expect(title.textContent).toBe("몽글이 · 안정형");
    expect(title.parentElement?.textContent).toBe("몽글이 · 안정형");
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
