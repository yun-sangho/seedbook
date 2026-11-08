import { describe, expect, it } from "vitest";
import type { InvestmentItem } from "../types/types";
import { sortAccounts } from "./sort-accounts";

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
  it("keeps the user-defined order for default", () => {
    expect(sortAccounts(accounts, "default").map((a) => a.id)).toEqual(["a", "b", "c"]);
  });

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
