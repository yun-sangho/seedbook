import { describe, expect, it } from "vitest";
import { commissionPercentOf, sellTaxRates, tradeCostOf } from "./trade-cost";

const defaultAccount = {};
const sell = (market: string, securityType: string | null) =>
  ({ action: "매도", market, securityType }) as const;
const buy = (market: string, securityType: string | null) =>
  ({ action: "매수", market, securityType }) as const;

describe("commissionPercentOf", () => {
  it("uses the default rate when the account has none", () => {
    expect(commissionPercentOf(defaultAccount)).toBe(0.015);
  });

  it("uses the account's own rate, even when it is zero", () => {
    expect(commissionPercentOf({ commissionPercent: 0.0036 })).toBe(0.0036);
    expect(commissionPercentOf({ commissionPercent: 0 })).toBe(0);
  });

  it("falls back to the default for a null rate", () => {
    expect(commissionPercentOf({ commissionPercent: null })).toBe(0.015);
  });
});

describe("sellTaxRates", () => {
  it("splits a KOSPI stock into 0.05% transaction tax and 0.15% rural tax", () => {
    expect(sellTaxRates("KOSPI", "stock")).toEqual({
      transactionTaxPercent: 0.05,
      ruralTaxPercent: 0.15,
    });
  });

  it("charges a KOSDAQ stock 0.20% transaction tax and no rural tax", () => {
    expect(sellTaxRates("KOSDAQ", "stock")).toEqual({
      transactionTaxPercent: 0.2,
      ruralTaxPercent: 0,
    });
  });

  it("does not tax ETFs and ETNs", () => {
    const none = { transactionTaxPercent: 0, ruralTaxPercent: 0 };
    expect(sellTaxRates("KOSPI", "etf")).toEqual(none);
    expect(sellTaxRates("KOSPI", "etn")).toEqual(none);
  });

  it("taxes a stock of unknown type like a stock", () => {
    expect(sellTaxRates("KOSPI", null).ruralTaxPercent).toBe(0.15);
  });

  it("does not apply the Korean transaction tax to overseas markets", () => {
    expect(sellTaxRates("NASDAQ", "stock")).toEqual({
      transactionTaxPercent: 0,
      ruralTaxPercent: 0,
    });
  });
});

describe("tradeCostOf", () => {
  it("adds commission, transaction tax and rural tax when selling a KOSPI stock", () => {
    // 1,000,000원: 수수료 150 + 거래세 500 + 농특세 1,500
    expect(tradeCostOf(defaultAccount, sell("KOSPI", "stock"), 1_000_000)).toMatchObject({
      commission: 150,
      transactionTax: 500,
      ruralTax: 1_500,
      total: 2_150,
    });
  });

  it("charges only the commission when selling an ETF", () => {
    expect(tradeCostOf(defaultAccount, sell("KOSPI", "etf"), 1_000_000).total).toBe(150);
  });

  it("charges only the commission when buying, even a stock", () => {
    expect(tradeCostOf(defaultAccount, buy("KOSPI", "stock"), 1_000_000)).toMatchObject({
      commission: 150,
      transactionTax: 0,
      ruralTax: 0,
      total: 150,
    });
  });

  it("uses the account's preferential commission but keeps the tax", () => {
    // 우대 0.0036396%: 1,000,000원 → 36원. 거래세 2,000원은 그대로
    const account = { commissionPercent: 0.0036396 };
    expect(tradeCostOf(account, sell("KOSDAQ", "stock"), 1_000_000)).toMatchObject({
      commission: 36,
      transactionTax: 2_000,
      total: 2_036,
    });
  });

  it("drops fractions of a won from each part separately", () => {
    // 12,345원: 수수료 1.85 → 1, 거래세 6.17 → 6, 농특세 18.51 → 18
    expect(tradeCostOf(defaultAccount, sell("KOSPI", "stock"), 12_345).total).toBe(25);
  });

  it("costs nothing for a zero amount", () => {
    expect(tradeCostOf(defaultAccount, sell("KOSPI", "stock"), 0).total).toBe(0);
  });
});
