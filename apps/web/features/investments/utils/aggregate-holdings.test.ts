import { describe, expect, it } from "vitest";
import type { InvestmentItem, StockHolding } from "../types/types";
import { aggregateHoldings } from "./aggregate-holdings";
import type { StockPricePoint } from "./use-stock-prices";

function holding(overrides: Partial<StockHolding> = {}): StockHolding {
  return {
    id: "h",
    market: "KOSPI",
    ticker: "005930",
    name: "삼성전자",
    currency: "KRW",
    quantity: 10,
    memo: "",
    ...overrides,
  };
}

function account(id: string, holdings: StockHolding[]): InvestmentItem {
  return {
    id,
    accountName: `계좌 ${id}`,
    accountType: "ISA",
    currency: "KRW",
    initialInvestment: 0,
    currentValue: 0,
    records: [],
    holdings,
    cashItems: [],
    note: "",
    color: "#000",
  };
}

function price(close: number): StockPricePoint {
  return { close, date: "2026-11-09", asOf: "2026-11-09T06:30:00.000Z", kind: "close" };
}

describe("aggregateHoldings", () => {
  it("returns an empty list when no account holds stocks", () => {
    expect(aggregateHoldings([account("a", [])], new Map())).toEqual([]);
  });

  it("sums the quantity of the same stock held in different accounts", () => {
    const accounts = [
      account("a", [holding({ id: "1", quantity: 10 })]),
      account("b", [holding({ id: "2", quantity: 5 })]),
    ];
    const prices = new Map([["KOSPI:005930", price(70_000)]]);

    const [row] = aggregateHoldings(accounts, prices);

    expect(row).toMatchObject({ name: "삼성전자", quantity: 15, price: 70_000, value: 1_050_000 });
  });

  it("lists the accounts holding the stock with each account's quantity", () => {
    const accounts = [
      account("a", [holding({ id: "1", quantity: 10 })]),
      account("b", [holding({ id: "2", quantity: 5 })]),
    ];

    const [row] = aggregateHoldings(accounts, new Map());

    expect(row?.accounts).toEqual([
      { id: "a", name: "계좌 a", color: "#000", quantity: 10 },
      { id: "b", name: "계좌 b", color: "#000", quantity: 5 },
    ]);
  });

  it("sorts by evaluated value, largest first", () => {
    const accounts = [
      account("a", [
        holding({ id: "1", ticker: "A", name: "에이", quantity: 1 }),
        holding({ id: "2", ticker: "B", name: "비", quantity: 1 }),
      ]),
    ];
    const prices = new Map([
      ["KOSPI:A", price(1_000)],
      ["KOSPI:B", price(5_000)],
    ]);

    expect(aggregateHoldings(accounts, prices).map((r) => r.name)).toEqual(["비", "에이"]);
  });

  it("puts stocks without a price last with a null price and value", () => {
    const accounts = [
      account("a", [
        holding({ id: "1", ticker: "NOPRICE", name: "시세없음", quantity: 1 }),
        holding({ id: "2", ticker: "A", name: "에이", quantity: 1 }),
      ]),
    ];
    const prices = new Map([["KOSPI:A", price(1_000)]]);

    const rows = aggregateHoldings(accounts, prices);

    expect(rows.map((r) => r.name)).toEqual(["에이", "시세없음"]);
    expect(rows[1]).toMatchObject({ price: null, value: null });
  });

  it("keeps legacy holdings without a ticker as separate rows with no price", () => {
    const accounts = [
      account("a", [holding({ id: "1", market: "", ticker: "", name: "옛 종목", quantity: 3 })]),
      account("b", [holding({ id: "2", market: "", ticker: "", name: "옛 종목", quantity: 2 })]),
    ];

    const rows = aggregateHoldings(accounts, new Map());

    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.price === null)).toBe(true);
  });
});
