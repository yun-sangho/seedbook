import { describe, expect, it } from "vitest";
import type { InvestmentItem } from "../types/types";
import { normalizeInvestment } from "./normalize-investment";

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
};

describe("normalizeInvestment", () => {
  // persist 는 JSON 으로 직렬화한다 — 메모리의 NaN 은 저장 직전에 null 이 된다.
  const broken = (patch: Record<string, unknown>) => ({ ...item, ...patch }) as InvestmentItem;

  it("turns a NaN or missing amount into 0", () => {
    const normalized = normalizeInvestment(
      broken({ initialInvestment: Number.NaN, currentValue: null })
    );

    expect([normalized.initialInvestment, normalized.currentValue]).toEqual([0, 0]);
  });

  it("fixes NaN quantities, cash amounts and record amounts", () => {
    const normalized = normalizeInvestment(
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

    expect(normalizeInvestment(withUnknown)).toEqual(withUnknown);
  });
});
