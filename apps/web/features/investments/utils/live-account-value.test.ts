import { describe, expect, it } from "vitest";
import type { InvestmentItem } from "../types/types";
import { liveAccountValue, withLiveValues } from "./live-account-value";
import type { StockPricePoint } from "./use-stock-prices";

function account(overrides: Partial<InvestmentItem> = {}): InvestmentItem {
  return {
    id: "acc",
    accountName: "계좌",
    accountType: "ISA",
    currency: "KRW",
    initialInvestment: 0,
    currentValue: 40_000_000,
    records: [],
    holdings: [
      {
        id: "h",
        market: "KOSPI",
        ticker: "A",
        name: "에이",
        currency: "KRW",
        quantity: 10,
        memo: "",
      },
    ],
    cashItems: [{ id: "c", label: "예수금", amount: 5_000 }],
    note: "",
    color: "#000",
    ...overrides,
  };
}

const PRICES = new Map<string, StockPricePoint>([
  [
    "KOSPI:A",
    { close: 1_000, date: "2026-11-06", asOf: "2026-11-06T06:30:00.000Z", kind: "close" },
  ],
]);

describe("liveAccountValue", () => {
  it("values holdings at the current price plus cash, ignoring the stored value", () => {
    expect(liveAccountValue(account(), PRICES)).toBe(15_000);
  });

  it("falls back to the stored value when nothing can be valued", () => {
    expect(liveAccountValue(account({ holdings: [], cashItems: [] }), PRICES)).toBe(40_000_000);
  });
});

describe("withLiveValues", () => {
  it("replaces currentValue with the live value", () => {
    const [result] = withLiveValues([account()], PRICES);

    expect(result?.currentValue).toBe(15_000);
  });

  it("keeps the same object when the value is unchanged", () => {
    const original = account({ currentValue: 15_000 });

    expect(withLiveValues([original], PRICES)[0]).toBe(original);
  });
});
