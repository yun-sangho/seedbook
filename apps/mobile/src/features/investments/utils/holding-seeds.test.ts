import { describe, expect, it } from "vitest";
import { toHoldingSeeds } from "./holding-seeds";

const samsung = { market: "KOSPI", ticker: "005930", name: "삼성전자", currency: "KRW" };
const hynix = { market: "KOSPI", ticker: "000660", name: "SK하이닉스", currency: "KRW" };

describe("toHoldingSeeds", () => {
  it("copies the stock identity with quantity 0", () => {
    const holding = { ...samsung, quantity: 12 };
    expect(toHoldingSeeds([holding])).toEqual([{ ...samsung, quantity: 0 }]);
  });

  it("works for portfolio allocations that have no quantity", () => {
    const allocation = { ...hynix, targetPercent: 30 };
    expect(toHoldingSeeds([allocation])).toEqual([{ ...hynix, quantity: 0 }]);
  });

  it("skips entries without a selected stock", () => {
    expect(
      toHoldingSeeds([{ market: "", ticker: "", name: "레거시", currency: "" }, samsung])
    ).toEqual([{ ...samsung, quantity: 0 }]);
  });

  it("removes duplicate stocks, keeping the first", () => {
    expect(toHoldingSeeds([samsung, hynix, { ...samsung, name: "중복" }])).toEqual([
      { ...samsung, quantity: 0 },
      { ...hynix, quantity: 0 },
    ]);
  });
});
