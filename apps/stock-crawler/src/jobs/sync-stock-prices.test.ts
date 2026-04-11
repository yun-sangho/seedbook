import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * syncStockPrices 는 prisma + fetchAllStockPrices 에 의존한다.
 * 주말 가드 검증이 핵심.
 */

const mocks = vi.hoisted(() => {
  return {
    findMany: vi.fn(),
    upsert: vi.fn(),
    fetchAllStockPrices: vi.fn(),
  };
});

vi.mock("@seedbook/database", () => ({
  prisma: {
    stock: { findMany: mocks.findMany },
    stockPrice: { upsert: mocks.upsert },
  },
}));

vi.mock("../sources/naver.js", () => ({
  fetchAllStockPrices: mocks.fetchAllStockPrices,
}));

const { syncStockPrices } = await import("./sync-stock-prices.js");

describe("syncStockPrices", () => {
  beforeEach(() => {
    mocks.findMany.mockReset().mockResolvedValue([]);
    mocks.upsert.mockReset().mockResolvedValue(undefined);
    mocks.fetchAllStockPrices.mockReset().mockResolvedValue([]);
  });

  it("date 인자 없이 토요일 시스템 시각: 조기 return", async () => {
    // 2025-01-04 is Saturday
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-04T10:00:00+09:00"));

    try {
      await syncStockPrices();
    } finally {
      vi.useRealTimers();
    }

    // 주말 → 조기 return. DB/크롤 호출 모두 0회.
    expect(mocks.findMany).toHaveBeenCalledTimes(0);
    expect(mocks.fetchAllStockPrices).toHaveBeenCalledTimes(0);
  });

  it("date 인자 없이 일요일 시스템 시각: 조기 return", async () => {
    // 2025-01-05 is Sunday
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-05T10:00:00+09:00"));

    try {
      await syncStockPrices();
    } finally {
      vi.useRealTimers();
    }

    expect(mocks.findMany).toHaveBeenCalledTimes(0);
    expect(mocks.fetchAllStockPrices).toHaveBeenCalledTimes(0);
  });

  it("date 인자 없이 평일 시스템 시각: 정상 실행", async () => {
    // 2025-01-02 is Thursday
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-02T10:00:00+09:00"));

    try {
      await syncStockPrices();
    } finally {
      vi.useRealTimers();
    }

    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.fetchAllStockPrices).toHaveBeenCalledTimes(1);
  });

  it("명시 date 인자 + 토요일: 호출자 의도 존중하여 실행됨", async () => {
    await syncStockPrices(new Date("2025-01-04T10:00:00+09:00"));

    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.fetchAllStockPrices).toHaveBeenCalledTimes(1);
  });
});
