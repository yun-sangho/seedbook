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
  sellCostPercent: 0.2,
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

  it("treats a missing sell cost rate as 0 (accounts saved before the field existed)", () => {
    const { sellCostPercent: _s, ...rest } = valid;

    expect(parseInvestmentFields(rest)?.sellCostPercent).toBe(0);
  });

  it("rejects a sell cost rate below 0 or at 100% and above", () => {
    expect(parseInvestmentFields({ ...valid, sellCostPercent: -0.1 })).toBeNull();
    expect(parseInvestmentFields({ ...valid, sellCostPercent: 100 })).toBeNull();
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
