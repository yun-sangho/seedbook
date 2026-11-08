import type { InvestmentItem, StockHolding } from "@web/features/investments/types/types";
import {
  stockPriceKey,
  type StockPricePoint,
} from "@web/features/investments/utils/use-stock-prices";
import { describe, expect, it } from "vitest";
import type { PortfolioAllocation, PortfolioItem } from "../types/types";
import { linkedPortfolioStatuses } from "./linked-portfolio-status";

function holding(ticker: string, quantity: number): StockHolding {
  return { id: ticker, market: "KOSPI", ticker, name: ticker, currency: "KRW", quantity, memo: "" };
}

function account(id: string, holdings: StockHolding[], cash = 0): InvestmentItem {
  return {
    id,
    accountName: id,
    accountType: "ISA 계좌",
    currency: "KRW",
    initialInvestment: 0,
    currentValue: 0,
    records: [],
    holdings,
    cashItems: cash > 0 ? [{ id: `${id}-cash`, label: "예수금", amount: cash }] : [],
    note: "",
    color: "#000",
  };
}

function allocation(ticker: string, targetPercent: number): PortfolioAllocation {
  return { id: ticker, market: "KOSPI", ticker, name: ticker, currency: "KRW", targetPercent };
}

function portfolio(partial: Partial<PortfolioItem> & Pick<PortfolioItem, "id">): PortfolioItem {
  return {
    name: partial.id,
    color: "#111",
    allocations: [],
    accountIds: [],
    driftThresholdPercent: 5,
    note: "",
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

const prices = new Map<string, StockPricePoint>([
  [stockPriceKey("KOSPI", "A"), { close: 1000, date: "2026-11-06" }],
  [stockPriceKey("KOSPI", "B"), { close: 1000, date: "2026-11-06" }],
]);

describe("linkedPortfolioStatuses", () => {
  it("returns nothing for an account no portfolio links to", () => {
    const acc = account("acc-1", [holding("A", 10)]);
    const p = portfolio({ id: "p", accountIds: ["other"], allocations: [allocation("A", 100)] });

    expect(linkedPortfolioStatuses("acc-1", [p], [acc], prices)).toEqual([]);
  });

  it("reports ok when the linked portfolio is within its drift threshold", () => {
    const acc = account("acc-1", [holding("A", 50), holding("B", 50)]);
    const p = portfolio({
      id: "p",
      accountIds: ["acc-1"],
      allocations: [allocation("A", 50), allocation("B", 50)],
    });

    const [status] = linkedPortfolioStatuses("acc-1", [p], [acc], prices);

    expect(status).toMatchObject({ portfolioId: "p", state: "ok", breachedCount: 0 });
  });

  it("flags needs-rebalancing when a gap exceeds the drift threshold", () => {
    const acc = account("acc-1", [holding("A", 80), holding("B", 20)]);
    const p = portfolio({
      id: "p",
      accountIds: ["acc-1"],
      allocations: [allocation("A", 50), allocation("B", 50)],
      driftThresholdPercent: 5,
    });

    const [status] = linkedPortfolioStatuses("acc-1", [p], [acc], prices);

    expect(status).toMatchObject({ state: "needs-rebalancing", breachedCount: 2 });
    expect(status?.maxAbsGapPercent).toBeCloseTo(30);
  });

  it("judges drift on the account's own holdings, not the sum of all linked accounts", () => {
    // 합산하면 50:50 으로 정상이지만, 리밸런싱 대상은 계좌라 acc-a 만 보면 A 100%.
    const accA = account("acc-a", [holding("A", 50)]);
    const accB = account("acc-b", [holding("B", 50)]);
    const p = portfolio({
      id: "p",
      accountIds: ["acc-a", "acc-b"],
      allocations: [allocation("A", 50), allocation("B", 50)],
    });

    const [status] = linkedPortfolioStatuses("acc-a", [p], [accA, accB], prices);

    expect(status).toMatchObject({ state: "needs-rebalancing", breachedCount: 2 });
    expect(status?.maxAbsGapPercent).toBeCloseTo(50);
  });

  it("reports unknown when the account holds nothing priced, even if another linked account does", () => {
    const accA = account("acc-a", []);
    const accB = account("acc-b", [holding("A", 50)]);
    const p = portfolio({
      id: "p",
      accountIds: ["acc-a", "acc-b"],
      allocations: [allocation("A", 100)],
    });

    const [status] = linkedPortfolioStatuses("acc-a", [p], [accA, accB], prices);

    expect(status?.state).toBe("unknown");
  });

  it("reports unknown when the portfolio has no allocations yet", () => {
    const acc = account("acc-1", [holding("A", 10)]);
    const p = portfolio({ id: "p", accountIds: ["acc-1"] });

    const [status] = linkedPortfolioStatuses("acc-1", [p], [acc], prices);

    expect(status?.state).toBe("unknown");
  });

  it("reports unknown when no linked holding has a price", () => {
    const acc = account("acc-1", [holding("A", 10)]);
    const p = portfolio({ id: "p", accountIds: ["acc-1"], allocations: [allocation("A", 100)] });

    const [status] = linkedPortfolioStatuses("acc-1", [p], [acc], new Map());

    expect(status?.state).toBe("unknown");
  });

  it("lists every portfolio linked to the account, needing rebalancing first", () => {
    const acc = account("acc-1", [holding("A", 80), holding("B", 20)]);
    const ok = portfolio({
      id: "ok",
      accountIds: ["acc-1"],
      allocations: [allocation("A", 80), allocation("B", 20)],
    });
    const bad = portfolio({
      id: "bad",
      accountIds: ["acc-1"],
      allocations: [allocation("A", 50), allocation("B", 50)],
    });

    const statuses = linkedPortfolioStatuses("acc-1", [ok, bad], [acc], prices);

    expect(statuses.map((s) => s.portfolioId)).toEqual(["bad", "ok"]);
  });

  it("counts the account's cash, which targets 0원, when judging drift", () => {
    // 주식만 보면 50:50 정상이지만 예수금이 전체의 50% 라 이격 초과.
    const acc = account("acc-1", [holding("A", 50), holding("B", 50)], 100_000);
    const p = portfolio({
      id: "p",
      accountIds: ["acc-1"],
      allocations: [allocation("A", 50), allocation("B", 50)],
    });

    const [status] = linkedPortfolioStatuses("acc-1", [p], [acc], prices);

    expect(status?.state).toBe("needs-rebalancing");
    expect(status?.maxAbsGapPercent).toBeCloseTo(50);
  });

  it("flags a cash-only account with target weights as needing rebalancing", () => {
    const acc = account("acc-1", [], 1_000_000);
    const p = portfolio({ id: "p", accountIds: ["acc-1"], allocations: [allocation("A", 100)] });

    const [status] = linkedPortfolioStatuses("acc-1", [p], [acc], prices);

    expect(status?.state).toBe("needs-rebalancing");
  });
});
