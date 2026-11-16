import { describe, expect, it } from "vitest";
import { sellCostOf } from "./sell-cost";

describe("sellCostOf", () => {
  it("charges a stock the 0.20% transaction tax plus the 0.015% default commission", () => {
    // 1,000,000원 → 거래세 2,000원 + 수수료 150원
    expect(sellCostOf({ sellCostPercent: 0 }, 1_000_000, "stock")).toEqual({
      kind: "auto",
      taxPercent: 0.2,
      tax: 2_000,
      commissionPercent: 0.015,
      commission: 150,
      total: 2_150,
    });
  });

  it("charges an ETF only the commission", () => {
    expect(sellCostOf({}, 1_000_000, "etf").total).toBe(150);
  });

  it("charges an ETN only the commission", () => {
    expect(sellCostOf({}, 1_000_000, "etn").total).toBe(150);
  });

  it("treats a security of unknown type as a stock", () => {
    expect(sellCostOf({}, 1_000_000, null).total).toBe(2_150);
  });

  it("drops the part below 1원 of the tax and the commission separately", () => {
    // 12,345원 → 거래세 24.69원 → 24원, 수수료 1.85원 → 1원
    expect(sellCostOf({}, 12_345, "stock").total).toBe(25);
  });

  it("uses the account's own rate instead when one is set", () => {
    expect(sellCostOf({ sellCostPercent: 0.3 }, 1_000_000, "etf")).toEqual({
      kind: "manual",
      percent: 0.3,
      total: 3_000,
    });
  });

  it("charges nothing on nothing sold", () => {
    expect(sellCostOf({}, 0, "stock").total).toBe(0);
  });
});
