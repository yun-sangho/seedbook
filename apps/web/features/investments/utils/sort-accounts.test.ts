import { describe, expect, it } from "vitest";
import type { InvestmentItem } from "../types/types";
import { normalizeAccountSortOption, sortAccounts } from "./sort-accounts";

function account(id: string, currentValue: number): InvestmentItem {
  return {
    id,
    accountName: id,
    accountType: "ISA 계좌",
    currency: "KRW",
    initialInvestment: 0,
    currentValue,
    records: [],
    holdings: [],
    cashItems: [],
    note: "",
    color: "#000",
  };
}

const accounts = [account("a", 300), account("b", 100), account("c", 200)];

describe("sortAccounts", () => {
  it("orders by valuation high to low", () => {
    expect(sortAccounts(accounts, "evalDesc").map((a) => a.id)).toEqual(["a", "c", "b"]);
  });

  it("orders by valuation low to high", () => {
    expect(sortAccounts(accounts, "evalAsc").map((a) => a.id)).toEqual(["b", "c", "a"]);
  });

  it("does not mutate the input array", () => {
    const input = [...accounts];
    sortAccounts(input, "evalAsc");
    expect(input.map((a) => a.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps the original order between accounts with equal valuation", () => {
    const tied = [account("x", 100), account("y", 100), account("z", 50)];
    expect(sortAccounts(tied, "evalDesc").map((a) => a.id)).toEqual(["x", "y", "z"]);
  });
});

describe("normalizeAccountSortOption", () => {
  it("keeps a known option", () => {
    expect(normalizeAccountSortOption("evalAsc")).toBe("evalAsc");
  });

  it("reads the removed 기본 순서 (default) as valuation high to low", () => {
    expect(normalizeAccountSortOption("default")).toBe("evalDesc");
  });

  it("falls back to valuation high to low for missing or unknown values", () => {
    expect(normalizeAccountSortOption(null)).toBe("evalDesc");
    expect(normalizeAccountSortOption("nameAsc")).toBe("evalDesc");
  });
});
