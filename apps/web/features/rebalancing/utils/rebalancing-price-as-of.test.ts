import { describe, expect, it } from "vitest";
import type { RebalancingTask } from "../types/types";
import { summarizeRebalancingPriceAsOf } from "./rebalancing-price-as-of";

function task(overrides: Partial<RebalancingTask> = {}): RebalancingTask {
  return {
    id: "a",
    market: "KOSPI",
    ticker: "005930",
    name: "삼성전자",
    action: "매수",
    amount: 1000,
    price: 70_000,
    quantity: 0,
    priceAsOf: "2026-11-06T06:30:00.000Z",
    priceKind: "close",
    done: false,
    ...overrides,
  };
}

describe("summarizeRebalancingPriceAsOf", () => {
  it("uses the latest price the tasks were calculated with", () => {
    const result = summarizeRebalancingPriceAsOf([
      task({ id: "a", priceAsOf: "2026-11-06T06:30:00.000Z", priceKind: "close" }),
      task({ id: "b", priceAsOf: "2026-11-07T01:00:00.000Z", priceKind: "realtime" }),
    ]);

    expect(result).toMatchObject({ asOf: "2026-11-07T01:00:00.000Z", kind: "realtime" });
  });

  it("ignores tasks started before the price time was recorded", () => {
    const result = summarizeRebalancingPriceAsOf([
      task({ id: "old", priceAsOf: null, priceKind: null }),
      task({ id: "new" }),
    ]);

    expect(result).toMatchObject({ asOf: "2026-11-06T06:30:00.000Z", hasLagging: false });
  });

  it("ignores tasks saved in the browser before the fields existed at all", () => {
    // 예전 로컬 저장본엔 priceAsOf/priceKind 키 자체가 없다 (null 이 아니라 undefined).
    const legacy = task({ id: "legacy" }) as Partial<RebalancingTask>;
    delete legacy.priceAsOf;
    delete legacy.priceKind;

    expect(summarizeRebalancingPriceAsOf([legacy as RebalancingTask])).toBeNull();
  });

  it("returns null when no task knows its price time", () => {
    expect(summarizeRebalancingPriceAsOf([task({ priceAsOf: null, priceKind: null })])).toBeNull();
  });
});
