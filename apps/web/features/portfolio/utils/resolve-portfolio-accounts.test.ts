import type { InvestmentItem } from "@web/features/investments/types/types";
import { describe, expect, it } from "vitest";
import { resolvePortfolioAccounts } from "./resolve-portfolio-accounts";

function makeAccount(id: string, name = id): InvestmentItem {
  return {
    id,
    accountName: name,
    accountType: "일반",
    accountOwner: "",
    currency: "KRW",
    initialInvestment: 0,
    currentValue: 0,
    records: [],
    holdings: [],
    cashItems: [],
    note: "",
    color: "#3b82f6",
  };
}

describe("resolvePortfolioAccounts", () => {
  const investments: InvestmentItem[] = [makeAccount("a"), makeAccount("b"), makeAccount("c")];

  it("returns all investments when accountIds is empty (backward compat)", () => {
    const result = resolvePortfolioAccounts({ accountIds: [] }, investments);
    expect(result).toEqual(investments);
  });

  it("filters to the specified ids", () => {
    const result = resolvePortfolioAccounts({ accountIds: ["a", "c"] }, investments);
    expect(result.map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("silently drops ids that do not exist", () => {
    const result = resolvePortfolioAccounts({ accountIds: ["a", "missing"] }, investments);
    expect(result.map((i) => i.id)).toEqual(["a"]);
  });

  it("returns empty array when no configured id matches any investment", () => {
    const result = resolvePortfolioAccounts({ accountIds: ["nope"] }, investments);
    expect(result).toEqual([]);
  });
});
