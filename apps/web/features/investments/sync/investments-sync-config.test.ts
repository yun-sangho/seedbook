import { describe, expect, it } from "vitest";
import type { InvestmentItem } from "../types/types";
import { investmentsSyncConfig } from "./investments-sync-config";

const item: InvestmentItem = {
  id: "acc-1",
  accountName: "ISA 계좌 1",
  accountType: "ISA 계좌",
  currency: "KRW",
  initialInvestment: 1000,
  currentValue: 1200,
  records: [{ date: "2026-11-01", initialInvestment: 1000, currentValue: 1200 }],
  holdings: [
    {
      id: "h-1",
      market: "KOSPI",
      ticker: "005930",
      name: "삼성전자",
      currency: "KRW",
      quantity: 1.5,
      memo: "",
    },
  ],
  cashItems: [{ id: "c-1", label: "예수금", amount: 50 }],
  note: "",
  color: "#3b82f6",
  sellCostPercent: 0.2,
};

describe("investmentsSyncConfig", () => {
  it("round-trips an account with its records, holdings and cash", () => {
    expect(investmentsSyncConfig.fromData("acc-1", investmentsSyncConfig.toData(item))).toEqual(
      item
    );
  });

  it("reads an account without a sell cost rate as 0", () => {
    const { sellCostPercent: _s, ...data } = investmentsSyncConfig.toData(item);

    expect(investmentsSyncConfig.fromData("acc-1", data).sellCostPercent).toBe(0);
  });

  it("sends numbers typed mid-edit (NaN) as 0 so the change is not rejected", () => {
    const data = investmentsSyncConfig.toData({
      ...item,
      currentValue: Number.NaN,
      holdings: [{ ...item.holdings[0]!, quantity: Number.NaN }],
    });

    expect(data.currentValue).toBe(0);
    expect((data.holdings as Array<{ quantity: number }>)[0]?.quantity).toBe(0);
  });
});
