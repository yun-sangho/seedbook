import { describe, expect, it } from "vitest";
import { parseDebtFields } from "./debt-record";

const valid = {
  loanName: "전세대출",
  loanType: "전세",
  lender: "은행",
  amount: 100_000_000,
  interestRate: 4.1,
  maturityDate: "2028-01-01",
  monthlyPayment: 350_000,
  note: "메모",
};

describe("parseDebtFields", () => {
  it("accepts a well-formed debt", () => {
    expect(parseDebtFields(valid)).toEqual(valid);
  });

  it("fills missing maturityDate and note with empty strings", () => {
    const { maturityDate: _m, note: _n, ...rest } = valid;

    expect(parseDebtFields(rest)).toEqual({ ...rest, maturityDate: "", note: "" });
  });

  it("rejects a non-numeric amount", () => {
    expect(parseDebtFields({ ...valid, amount: "1000" })).toBeNull();
  });

  it("rejects non-finite numbers", () => {
    expect(parseDebtFields({ ...valid, interestRate: Number.NaN })).toBeNull();
  });

  it("rejects a malformed maturity date", () => {
    expect(parseDebtFields({ ...valid, maturityDate: "someday" })).toBeNull();
  });

  it("rejects a missing required text field", () => {
    const { lender: _l, ...rest } = valid;

    expect(parseDebtFields(rest)).toBeNull();
  });

  it("rejects non-object input", () => {
    expect(parseDebtFields(null)).toBeNull();
    expect(parseDebtFields("debt")).toBeNull();
  });
});
