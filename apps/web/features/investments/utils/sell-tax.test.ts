import { describe, expect, it } from "vitest";
import { sellTaxOf, sellTaxRates } from "./sell-tax";

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

  it("charges a KONEX stock 0.10% transaction tax", () => {
    expect(sellTaxRates("KONEX", "stock")).toEqual({
      transactionTaxPercent: 0.1,
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

  it("taxes a stock of unknown market like KOSDAQ", () => {
    expect(sellTaxRates("", "stock").transactionTaxPercent).toBe(0.2);
  });

  it("does not apply the Korean transaction tax to overseas markets", () => {
    expect(sellTaxRates("NASDAQ", "stock")).toEqual({
      transactionTaxPercent: 0,
      ruralTaxPercent: 0,
    });
  });
});

describe("sellTaxOf", () => {
  it("adds transaction tax and rural tax when selling a KOSPI stock", () => {
    // 1,000,000원: 거래세 500 + 농특세 1,500
    expect(sellTaxOf("KOSPI", "stock", 1_000_000)).toMatchObject({
      transactionTax: 500,
      ruralTax: 1_500,
      total: 2_000,
    });
  });

  it("charges nothing when selling an ETF", () => {
    expect(sellTaxOf("KOSPI", "etf", 1_000_000).total).toBe(0);
  });

  it("drops fractions of a won from each tax separately", () => {
    // 12,345원: 거래세 6.17 → 6, 농특세 18.51 → 18
    expect(sellTaxOf("KOSPI", "stock", 12_345).total).toBe(24);
  });

  it("charges nothing for a zero amount", () => {
    expect(sellTaxOf("KOSPI", "stock", 0).total).toBe(0);
  });
});
