import { describe, expect, it } from "vitest";
import type { InvestmentItem } from "../types/types";
import { summarizeAccounts } from "./summarize-accounts";

function account(initialInvestment: number, currentValue: number): InvestmentItem {
  return {
    id: crypto.randomUUID(),
    accountName: "계좌",
    accountType: "ISA",
    currency: "KRW",
    initialInvestment,
    currentValue,
    records: [],
    holdings: [],
    cashItems: [],
    note: "",
    color: "#000",
  };
}

describe("summarizeAccounts", () => {
  it("sums value and principal across accounts and derives profit and return rate", () => {
    const result = summarizeAccounts([account(1_000_000, 1_200_000), account(1_000_000, 900_000)]);

    expect(result).toEqual({
      initial: 2_000_000,
      current: 2_100_000,
      profit: 100_000,
      returnRate: 5,
    });
  });

  it("returns zeros for no accounts", () => {
    expect(summarizeAccounts([])).toEqual({ initial: 0, current: 0, profit: 0, returnRate: 0 });
  });
});
