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

describe("investmentsSyncConfig.normalizeItem", () => {
  // persist 는 JSON 으로 직렬화한다 — 메모리의 NaN 은 저장 직전에 null 이 된다.
  const broken = (patch: Record<string, unknown>) => ({ ...item, ...patch }) as InvestmentItem;

  it("turns a NaN or missing amount into 0", () => {
    const normalized = investmentsSyncConfig.normalizeItem(
      broken({ initialInvestment: Number.NaN, currentValue: null })
    );

    expect([normalized.initialInvestment, normalized.currentValue]).toEqual([0, 0]);
  });

  it("turns a sell cost rate outside 0 to under 100 into 0", () => {
    expect(
      investmentsSyncConfig.normalizeItem(broken({ sellCostPercent: 100 })).sellCostPercent
    ).toBe(0);
    expect(
      investmentsSyncConfig.normalizeItem(broken({ sellCostPercent: -1 })).sellCostPercent
    ).toBe(0);
  });

  it("fixes NaN quantities, cash amounts and record amounts", () => {
    const normalized = investmentsSyncConfig.normalizeItem(
      broken({
        holdings: [{ ...item.holdings[0], quantity: null }],
        cashItems: [{ ...item.cashItems[0], amount: Number.NaN }],
        records: [{ ...item.records[0], currentValue: Number.POSITIVE_INFINITY }],
      })
    );

    expect(normalized.holdings[0]?.quantity).toBe(0);
    expect(normalized.cashItems[0]?.amount).toBe(0);
    expect(normalized.records[0]?.currentValue).toBe(0);
  });

  it("leaves a valid account as it is, including fields it does not know", () => {
    const withUnknown = { ...item, futureField: "x" } as InvestmentItem;

    expect(investmentsSyncConfig.normalizeItem(withUnknown)).toEqual(withUnknown);
  });

  it("sends the normalized values", () => {
    expect(investmentsSyncConfig.toData(broken({ sellCostPercent: 100 })).sellCostPercent).toBe(0);
  });
});
