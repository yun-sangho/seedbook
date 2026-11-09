import { describe, expect, it } from "vitest";
import { MAX_REBALANCING_TASKS, parseRebalancingFields } from "./rebalancing-record";

function validTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "alloc-1",
    market: "KOSPI",
    ticker: "005930",
    name: "삼성전자",
    action: "매수",
    amount: 1_000_000,
    price: 70_000,
    quantity: 14,
    priceAsOf: "2026-11-06T06:30:00.000Z",
    priceKind: "close",
    executedQuantity: null,
    done: false,
    ...overrides,
  };
}

function validFields(overrides: Record<string, unknown> = {}) {
  return {
    accountId: "acc-1",
    accountName: "연금저축",
    portfolioId: "pf-1",
    portfolioName: "안정형",
    cashDelta: 0,
    tasks: [validTask()],
    startedAt: "2026-11-08T00:00:00.000Z",
    completedAt: null,
    ...overrides,
  };
}

describe("parseRebalancingFields", () => {
  it("accepts a well-formed in-progress rebalancing", () => {
    expect(parseRebalancingFields(validFields())).toEqual({ ...validFields(), result: null });
  });

  it("treats a missing completedAt as in progress", () => {
    const fields: Record<string, unknown> = validFields();
    delete fields.completedAt;

    expect(parseRebalancingFields(fields)?.completedAt).toBeNull();
  });

  it("treats a missing price time as unknown for rebalancings started before it was recorded", () => {
    const legacy: Record<string, unknown> = validTask();
    delete legacy.priceAsOf;
    delete legacy.priceKind;

    expect(parseRebalancingFields(validFields({ tasks: [legacy] }))?.tasks[0]).toMatchObject({
      priceAsOf: null,
      priceKind: null,
    });
  });

  it("rejects an unknown price kind", () => {
    expect(
      parseRebalancingFields(validFields({ tasks: [validTask({ priceKind: "after-hours" })] }))
    ).toBeNull();
  });

  it("accepts null price and quantity when there was no quote", () => {
    const fields = validFields({
      tasks: [validTask({ price: null, quantity: null, priceAsOf: null, priceKind: null })],
    });

    expect(parseRebalancingFields(fields)?.tasks[0]).toMatchObject({ price: null, quantity: null });
  });

  it("keeps the quantity actually traded for a checked task", () => {
    const fields = validFields({ tasks: [validTask({ done: true, executedQuantity: 12 })] });

    expect(parseRebalancingFields(fields)?.tasks[0]?.executedQuantity).toBe(12);
  });

  it("treats a missing traded quantity as unknown for tasks checked before it was recorded", () => {
    const legacy: Record<string, unknown> = validTask({ done: true });
    delete legacy.executedQuantity;

    expect(parseRebalancingFields(validFields({ tasks: [legacy] }))?.tasks[0]).toMatchObject({
      executedQuantity: null,
    });
  });

  it("rejects a traded quantity that is not a number", () => {
    const fields = validFields({ tasks: [validTask({ executedQuantity: "12" })] });

    expect(parseRebalancingFields(fields)).toBeNull();
  });

  it("drops unknown task fields before they reach the jsonb column", () => {
    const fields = validFields({ tasks: [validTask({ extra: "x".repeat(10) })] });

    expect(parseRebalancingFields(fields)?.tasks[0]).not.toHaveProperty("extra");
  });

  it("rejects a task with an unknown action", () => {
    expect(
      parseRebalancingFields(validFields({ tasks: [validTask({ action: "유지" })] }))
    ).toBeNull();
  });

  it("rejects an invalid startedAt timestamp", () => {
    expect(parseRebalancingFields(validFields({ startedAt: "not a date" }))).toBeNull();
  });

  it("rejects more tasks than the limit", () => {
    const tasks = Array.from({ length: MAX_REBALANCING_TASKS + 1 }, (_, i) =>
      validTask({ id: `a${i}` })
    );

    expect(parseRebalancingFields(validFields({ tasks }))).toBeNull();
  });
});

describe("parseRebalancingFields result", () => {
  function validResult(overrides: Record<string, unknown> = {}) {
    return {
      holdings: [
        {
          market: "KOSPI",
          ticker: "005930",
          name: "삼성전자",
          quantity: 13,
          change: 3,
          percent: 24.8,
          targetPercent: 25,
        },
      ],
      cash: 8_300,
      cashPercent: 0.3,
      ...overrides,
    };
  }

  it("keeps the result snapshot of a completed rebalancing", () => {
    const fields = validFields({ completedAt: "2026-11-09T00:00:00.000Z", result: validResult() });

    expect(parseRebalancingFields(fields)?.result).toEqual(validResult());
  });

  it("treats a missing result as none for rebalancings completed before it was recorded", () => {
    expect(parseRebalancingFields(validFields())?.result).toBeNull();
  });

  it("accepts null shares when a price was unknown", () => {
    const result = validResult({ cashPercent: null });
    (result.holdings[0] as Record<string, unknown>).percent = null;

    expect(parseRebalancingFields(validFields({ result }))?.result).toEqual(result);
  });

  it("rejects a malformed result holding", () => {
    const result = validResult({ holdings: [{ name: "삼성전자" }] });

    expect(parseRebalancingFields(validFields({ result }))).toBeNull();
  });

  it("drops unknown result fields before they reach the jsonb column", () => {
    const result = validResult({ extra: "x" });
    (result.holdings[0] as Record<string, unknown>).extra = "y";

    const parsed = parseRebalancingFields(validFields({ result }))?.result;

    expect(parsed).not.toHaveProperty("extra");
    expect(parsed?.holdings[0]).not.toHaveProperty("extra");
  });
});
