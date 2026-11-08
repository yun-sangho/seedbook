import { describe, expect, it } from "vitest";
import type { SavingsItem } from "../types/types";
import { savingsSyncConfig } from "./savings-sync-config";

const item: SavingsItem = {
  id: "a",
  accountName: "급여통장",
  accountType: "입출금",
  currency: "KRW",
  balance: 1000,
  records: [{ date: "2026-11-01", balance: 1000 }],
  note: "",
  color: "#10b981",
};

describe("savingsSyncConfig", () => {
  it("sends a missing interest rate as null (the server rejects undefined fields)", () => {
    expect(savingsSyncConfig.toData(item)).toEqual({
      accountName: "급여통장",
      accountType: "입출금",
      currency: "KRW",
      balance: 1000,
      interestRate: null,
      note: "",
      color: "#10b981",
      records: [{ date: "2026-11-01", balance: 1000 }],
    });
  });

  it("restores a null interest rate as an absent field", () => {
    const restored = savingsSyncConfig.fromData("a", savingsSyncConfig.toData(item));

    expect(restored).toEqual(item);
    expect("interestRate" in restored).toBe(false);
  });

  it("keeps a set interest rate through the round trip", () => {
    const withRate = { ...item, interestRate: 3.5 };

    expect(savingsSyncConfig.fromData("a", savingsSyncConfig.toData(withRate))).toEqual(withRate);
  });

  it("sends non-finite numbers typed mid-edit as 0 so the change is not rejected", () => {
    const data = savingsSyncConfig.toData({ ...item, balance: Number.NaN });

    expect(data.balance).toBe(0);
  });
});
