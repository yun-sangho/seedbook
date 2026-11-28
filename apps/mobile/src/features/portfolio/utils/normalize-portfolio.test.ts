import { describe, expect, it } from "vitest";
import type { PortfolioItem } from "../types/types";
import { normalizePortfolio } from "./normalize-portfolio";

const item: PortfolioItem = {
  id: "p-1",
  name: "안정형",
  color: "#111111",
  allocations: [
    {
      id: "a-1",
      market: "KOSPI",
      ticker: "005930",
      name: "삼성전자",
      currency: "KRW",
      targetPercent: 50,
    },
  ],
  accountIds: ["acc-1"],
  driftMode: "relative",
  driftThresholdPercent: 5,
  goalAmount: 30_000_000,
  growthStage: 1,
  goalHistory: [{ amount: 10_000_000, reachedAt: "2026-10-15T06:30:00.000Z" }],
  season: 2,
  plantKind: "fern",
  plantName: "몽글이",
  wish: "부모님과 제주 여행",
  wishHistory: [{ wish: "부모님과 제주 여행", at: "2026-10-01T00:00:00.000Z" }],
  fruitGoal: null,
  driftSince: "2026-11-20T15:00:00.000Z",
  note: "",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
};

describe("normalizePortfolio", () => {
  const broken = (patch: Record<string, unknown>) => ({ ...item, ...patch }) as PortfolioItem;

  it("turns a NaN or negative drift threshold into 0", () => {
    expect(normalizePortfolio(broken({ driftThresholdPercent: null })).driftThresholdPercent).toBe(
      0
    );
    expect(normalizePortfolio(broken({ driftThresholdPercent: -3 })).driftThresholdPercent).toBe(0);
  });

  it("turns a NaN target percent into 0", () => {
    const normalized = normalizePortfolio(
      broken({ allocations: [{ ...item.allocations[0], targetPercent: Number.NaN }] })
    );

    expect(normalized.allocations[0]?.targetPercent).toBe(0);
  });

  it("leaves a valid portfolio as it is, including fields it does not know", () => {
    const withUnknown = { ...item, futureField: 1 } as PortfolioItem;

    expect(normalizePortfolio(withUnknown)).toEqual(withUnknown);
  });
});
