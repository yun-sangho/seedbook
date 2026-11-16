import { describe, expect, it } from "vitest";
import { parseInvestmentFields } from "./investment-record";

const valid = {
  accountName: "ISA 계좌 1",
  accountType: "ISA 계좌",
  currency: "KRW",
  initialInvestment: 1_000_000,
  currentValue: 1_200_000,
  note: "",
  color: "#3b82f6",
  stockCommissionPercent: 0.0036396,
  etfCommissionPercent: 0.0042087,
  records: [{ date: "2026-11-01", initialInvestment: 1_000_000, currentValue: 1_200_000 }],
  holdings: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      market: "KOSPI",
      ticker: "005930",
      name: "삼성전자",
      currency: "KRW",
      quantity: 10,
      memo: "",
    },
  ],
  cashItems: [{ id: "22222222-2222-4222-8222-222222222222", label: "예수금", amount: 50_000 }],
};

describe("parseInvestmentFields", () => {
  it("accepts a well-formed investment account", () => {
    expect(parseInvestmentFields(valid)).toEqual(valid);
  });

  it("treats missing nested lists as empty and a missing note as empty", () => {
    const { records: _r, holdings: _h, cashItems: _c, note: _n, ...rest } = valid;

    expect(parseInvestmentFields(rest)).toEqual({
      ...rest,
      note: "",
      records: [],
      holdings: [],
      cashItems: [],
    });
  });

  it("treats a missing commission rate as null (accounts saved before the field existed)", () => {
    const { stockCommissionPercent: _c, ...rest } = valid;

    expect(parseInvestmentFields(rest)?.stockCommissionPercent).toBeNull();
  });

  it("accepts a zero commission rate (commission-free accounts)", () => {
    expect(
      parseInvestmentFields({ ...valid, stockCommissionPercent: 0 })?.stockCommissionPercent
    ).toBe(0);
  });

  it("rejects a commission rate below 0, at 100% and above, or not a number", () => {
    expect(parseInvestmentFields({ ...valid, stockCommissionPercent: -0.1 })).toBeNull();
    expect(parseInvestmentFields({ ...valid, stockCommissionPercent: 100 })).toBeNull();
    expect(parseInvestmentFields({ ...valid, stockCommissionPercent: "0.01" })).toBeNull();
  });

  it("keeps the ETF commission rate separate, null meaning the stock rate", () => {
    const { etfCommissionPercent: _e, ...rest } = valid;

    expect(parseInvestmentFields(valid)?.etfCommissionPercent).toBe(0.0042087);
    expect(parseInvestmentFields(rest)?.etfCommissionPercent).toBeNull();
  });

  it("rejects an ETF commission rate outside 0 to under 100%", () => {
    expect(parseInvestmentFields({ ...valid, etfCommissionPercent: -1 })).toBeNull();
    expect(parseInvestmentFields({ ...valid, etfCommissionPercent: 100 })).toBeNull();
  });

  it("allows fractional holding quantities", () => {
    const holdings = [{ ...valid.holdings[0]!, quantity: 0.5 }];

    expect(parseInvestmentFields({ ...valid, holdings })?.holdings[0]?.quantity).toBe(0.5);
  });

  it("rejects a holding whose id is not a UUID", () => {
    const holdings = [{ ...valid.holdings[0]!, id: "h1" }];

    expect(parseInvestmentFields({ ...valid, holdings })).toBeNull();
  });

  it("rejects a cash item with a non-numeric amount", () => {
    const cashItems = [{ ...valid.cashItems[0]!, amount: "1000" }];

    expect(parseInvestmentFields({ ...valid, cashItems })).toBeNull();
  });

  it("rejects a record with a malformed date", () => {
    const records = [{ ...valid.records[0]!, date: "어제" }];

    expect(parseInvestmentFields({ ...valid, records })).toBeNull();
  });

  it("rejects a non-numeric current value", () => {
    expect(parseInvestmentFields({ ...valid, currentValue: null })).toBeNull();
  });
});
