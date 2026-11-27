import { describe, expect, it } from "vitest";
import type { PortfolioItem } from "../types/types";
import { portfolioSyncConfig } from "./portfolio-sync-config";

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
  note: "",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
};

describe("portfolioSyncConfig", () => {
  it("does not send client timestamps (the server records its own)", () => {
    const data = portfolioSyncConfig.toData(item);

    expect(data).not.toHaveProperty("createdAt");
    expect(data).not.toHaveProperty("updatedAt");
  });

  it("does not treat a timestamp-only change as a change to sync", () => {
    expect(portfolioSyncConfig.toData({ ...item, updatedAt: "2026-12-01T00:00:00.000Z" })).toEqual(
      portfolioSyncConfig.toData(item)
    );
  });

  it("takes the server's timestamps from pulled data", () => {
    const pulled = {
      ...portfolioSyncConfig.toData(item),
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-11-08T00:00:00.000Z",
    };

    expect(portfolioSyncConfig.fromData("p-1", pulled)).toEqual({
      ...item,
      updatedAt: "2026-11-08T00:00:00.000Z",
    });
  });

  it("reads a portfolio pulled without a drift mode as the legacy %p mode", () => {
    const pulled: Record<string, unknown> = {
      ...portfolioSyncConfig.toData(item),
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
    };
    delete pulled.driftMode;

    expect(portfolioSyncConfig.fromData("p-1", pulled).driftMode).toBe("absolute");
  });

  it("sends and reads back the plant's goal, stage and reached goals", () => {
    const data = portfolioSyncConfig.toData(item);

    expect(data).toMatchObject({
      goalAmount: 30_000_000,
      growthStage: 1,
      goalHistory: [{ amount: 10_000_000, reachedAt: "2026-10-15T06:30:00.000Z" }],
    });
  });

  it("reads a portfolio pulled without a plant as a seed", () => {
    const pulled: Record<string, unknown> = {
      ...portfolioSyncConfig.toData(item),
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
    };
    delete pulled.goalAmount;
    delete pulled.growthStage;
    delete pulled.goalHistory;

    expect(portfolioSyncConfig.fromData("p-1", pulled)).toMatchObject({
      goalAmount: null,
      growthStage: 0,
      goalHistory: [],
    });
  });
});
