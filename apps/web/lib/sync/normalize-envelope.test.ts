import { describe, expect, it } from "vitest";
import { normalizePersistedEnvelope } from "./normalize-envelope";

const account = {
  id: "11111111-1111-4111-8111-111111111111",
  accountName: "계좌",
  accountType: "일반 투자 계좌",
  currency: "KRW",
  initialInvestment: 1000,
  currentValue: 1200,
  records: [],
  holdings: [],
  cashItems: [],
  note: "",
  color: "#ff0000",
};

describe("normalizePersistedEnvelope", () => {
  it("normalizes each item of a synced store's list before it is saved", () => {
    // persist 는 메모리의 NaN 을 JSON null 로 직렬화한다.
    const value = JSON.stringify({
      state: { investments: [{ ...account, currentValue: null }], holdingsSortOption: "nameAsc" },
      version: 0,
    });

    expect(JSON.parse(normalizePersistedEnvelope("investment-storage", value))).toEqual({
      state: { investments: [{ ...account, currentValue: 0 }], holdingsSortOption: "nameAsc" },
      version: 0,
    });
  });

  it("returns the same string when nothing needs fixing", () => {
    const value = JSON.stringify({ state: { investments: [account] }, version: 0 });

    expect(normalizePersistedEnvelope("investment-storage", value)).toBe(value);
  });

  it("leaves other stores and values that are not envelopes alone", () => {
    const other = JSON.stringify({ state: { anything: Number.NaN }, version: 1 });

    expect(normalizePersistedEnvelope("seedbook.preferences", other)).toBe(other);
    expect(normalizePersistedEnvelope("investment-storage", "not json")).toBe("not json");
    expect(normalizePersistedEnvelope("investment-storage", '{"state":{}}')).toBe('{"state":{}}');
  });
});
