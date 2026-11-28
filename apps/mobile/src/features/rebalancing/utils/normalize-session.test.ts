import { describe, expect, it } from "vitest";
import type { RebalancingSession } from "../types/types";
import { normalizeSession } from "./normalize-session";

const session: RebalancingSession = {
  id: "11111111-1111-4111-8111-111111111111",
  accountId: "acc-1",
  accountName: "연금저축",
  portfolioId: "pf-1",
  portfolioName: "안정형",
  cashDelta: -1200,
  tasks: [
    {
      id: "task-1",
      market: "KRX",
      ticker: "005930",
      name: "삼성전자",
      action: "매수",
      amount: 70_000,
      price: 70_000,
      quantity: 1,
      executedQuantity: null,
      executedPrice: null,
      orderedQuantity: null,
      orderedPrice: null,
      filledQuantity: null,
      filledAmount: null,
      priceAsOf: null,
      priceKind: null,
      done: false,
    },
  ],
  startedAt: "2026-11-10T01:02:03.000Z",
  completedAt: null,
  result: {
    holdings: [
      {
        market: "KRX",
        ticker: "005930",
        name: "삼성전자",
        quantity: 1,
        change: 1,
        percent: 50,
        targetPercent: 50,
      },
    ],
    cash: 1000,
    cashPercent: 50,
    cashBefore: null,
  },
};

describe("normalizeSession", () => {
  const broken = (patch: Record<string, unknown>) =>
    ({ ...session, ...patch }) as RebalancingSession;

  it("turns a NaN cash delta into 0", () => {
    expect(normalizeSession(broken({ cashDelta: null })).cashDelta).toBe(0);
  });

  it("turns a NaN task amount into 0 and a NaN optional number into null", () => {
    const [task] = normalizeSession(
      broken({ tasks: [{ ...session.tasks[0], amount: null, executedQuantity: Number.NaN }] })
    ).tasks;

    expect([task?.amount, task?.executedQuantity]).toEqual([0, null]);
  });

  it("fixes NaN numbers in the result", () => {
    const normalized = normalizeSession(
      broken({
        result: {
          ...session.result,
          cash: null,
          holdings: [{ ...session.result?.holdings[0], change: Number.NaN, percent: null }],
        },
      })
    );

    expect(normalized.result?.cash).toBe(0);
    expect(normalized.result?.holdings[0]).toMatchObject({ change: 0, percent: null });
  });

  it("leaves a valid session as it is, including fields it does not know", () => {
    const withUnknown = { ...session, futureField: true } as RebalancingSession;

    expect(normalizeSession(withUnknown)).toEqual(withUnknown);
  });
});
