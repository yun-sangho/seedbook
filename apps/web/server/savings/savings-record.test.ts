import { describe, expect, it } from "vitest";
import { parseSavingsFields } from "./savings-record";

const valid = {
  accountName: "급여통장",
  accountType: "입출금",
  currency: "KRW",
  balance: 1_500_000,
  interestRate: 0.1,
  note: "메모",
  color: "#10b981",
  records: [
    { date: "2026-11-01", balance: 1_500_000 },
    { date: "2026-10-01", balance: 1_000_000 },
  ],
};

describe("parseSavingsFields", () => {
  it("accepts a well-formed savings account", () => {
    expect(parseSavingsFields(valid)).toEqual(valid);
  });

  it("treats a missing interest rate as none and a missing note as empty", () => {
    const { interestRate: _r, note: _n, ...rest } = valid;

    expect(parseSavingsFields(rest)).toEqual({ ...rest, interestRate: null, note: "" });
  });

  it("treats missing records as an empty history", () => {
    const { records: _records, ...rest } = valid;

    expect(parseSavingsFields(rest)?.records).toEqual([]);
  });

  it("rejects a non-numeric balance", () => {
    expect(parseSavingsFields({ ...valid, balance: "lots" })).toBeNull();
  });

  it("rejects a record with a malformed date", () => {
    expect(parseSavingsFields({ ...valid, records: [{ date: "soon", balance: 1 }] })).toBeNull();
  });

  it("rejects a record with a non-numeric balance", () => {
    expect(
      parseSavingsFields({ ...valid, records: [{ date: "2026-11-01", balance: null }] })
    ).toBeNull();
  });

  it("rejects a missing account name", () => {
    const { accountName: _a, ...rest } = valid;

    expect(parseSavingsFields(rest)).toBeNull();
  });
});
