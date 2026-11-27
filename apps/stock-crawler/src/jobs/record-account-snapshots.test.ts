import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * snapshotAccounts 는 계산·저장을 `recordAccountSnapshots` (database 패키지, DB 통합 테스트는
 * apps/web/server/account-snapshots) 에 맡긴다. 여기서는 날짜 고르기와 실패를 삼키는지만 본다.
 */

const mocks = vi.hoisted(() => ({
  recordAccountSnapshots: vi.fn(),
  growPortfolioPlants: vi.fn(),
}));

vi.mock("@seedbook/database", async () => {
  const actual = await vi.importActual<typeof import("@seedbook/database")>("@seedbook/database");
  return {
    ...actual,
    db: {},
    recordAccountSnapshots: mocks.recordAccountSnapshots,
    growPortfolioPlants: mocks.growPortfolioPlants,
  };
});

const { snapshotAccounts } = await import("./record-account-snapshots.js");

async function at<T>(iso: string, fn: () => Promise<T>): Promise<T> {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
  try {
    return await fn();
  } finally {
    vi.useRealTimers();
  }
}

describe("snapshotAccounts", () => {
  beforeEach(() => {
    mocks.recordAccountSnapshots
      .mockReset()
      .mockResolvedValue({ accounts: 0, accountsWithMissingPrices: 0 });
    mocks.growPortfolioPlants.mockReset().mockResolvedValue({ grown: 0 });
  });

  it("grows portfolio plants from the day it recorded", async () => {
    await at("2026-11-27T07:40:00Z", () => snapshotAccounts());

    expect(mocks.growPortfolioPlants).toHaveBeenCalledWith({}, "2026-11-27");
  });

  it("records today's KST date on a weekday", async () => {
    // 2026-11-27 (금) 16:40 KST
    await at("2026-11-27T07:40:00Z", () => snapshotAccounts());

    expect(mocks.recordAccountSnapshots).toHaveBeenCalledWith({}, "2026-11-27");
  });

  it("skips a weekend when no date is given", async () => {
    // 2026-11-28 (토) KST
    await at("2026-11-28T07:40:00Z", () => snapshotAccounts());

    expect(mocks.recordAccountSnapshots).not.toHaveBeenCalled();
  });

  it("records the given date even on a weekend (manual re-run)", async () => {
    await at("2026-11-28T07:40:00Z", () => snapshotAccounts("2026-11-26"));

    expect(mocks.recordAccountSnapshots).toHaveBeenCalledWith({}, "2026-11-26");
  });

  it("logs a failure and reports it without throwing", async () => {
    mocks.recordAccountSnapshots.mockRejectedValue(new Error("query timeout"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const ok = await snapshotAccounts("2026-11-27");

    expect(ok).toBe(false);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
