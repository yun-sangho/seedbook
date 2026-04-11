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

// prisma 만 mock 하고 kst* 헬퍼는 실제 구현을 통과시킨다 (syncStockPrices 가
// 내부적으로 kstDateString/kstDayOfWeek 를 import 하므로).
vi.mock("@seedbook/database", async () => {
  const actual = await vi.importActual<typeof import("@seedbook/database")>("@seedbook/database");
  return {
    ...actual,
    prisma: {
      stock: { findMany: mocks.findMany },
      stockPrice: { upsert: mocks.upsert },
    },
  };
});

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

  // ─── TZ 경계 케이스: KST ≠ UTC 인 시각에서도 KST 기준 주말 판정이 맞는지 ───
  // 과거 버그: 프로세스 TZ 가 UTC 인 컨테이너에서 .getDay() 는 UTC 요일을 반환해서
  // KST 월요일 새벽을 UTC 일요일 밤으로 오인 → 월요일 수집을 스킵하던 이슈.

  it("★ TZ 경계: KST 월요일 05:00 (UTC 일요일 20:00) → 평일로 판정", async () => {
    vi.useFakeTimers();
    // 2025-04-14 05:00 KST = 2025-04-13 20:00 UTC (UTC는 일요일)
    vi.setSystemTime(new Date("2025-04-13T20:00:00Z"));

    try {
      await syncStockPrices();
    } finally {
      vi.useRealTimers();
    }

    // KST 월요일이므로 실행되어야 한다 (UTC 기준 일요일로 오인하면 이 테스트가 깨진다)
    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.fetchAllStockPrices).toHaveBeenCalledTimes(1);
  });

  it("★ TZ 경계: KST 토요일 00:01 (UTC 금요일 15:01) → 주말로 스킵", async () => {
    vi.useFakeTimers();
    // 2025-04-19 00:01 KST = 2025-04-18 15:01 UTC (UTC는 금요일)
    vi.setSystemTime(new Date("2025-04-18T15:01:00Z"));

    try {
      await syncStockPrices();
    } finally {
      vi.useRealTimers();
    }

    // KST 토요일이므로 스킵되어야 한다 (UTC 기준 금요일로 오인하면 이 테스트가 깨진다)
    expect(mocks.findMany).toHaveBeenCalledTimes(0);
    expect(mocks.fetchAllStockPrices).toHaveBeenCalledTimes(0);
  });

  it("★ TZ 경계: KST 금요일 23:59 (UTC 금요일 14:59) → 평일로 실행", async () => {
    vi.useFakeTimers();
    // 2025-04-18 23:59 KST = 2025-04-18 14:59 UTC (양쪽 모두 금요일)
    vi.setSystemTime(new Date("2025-04-18T14:59:00Z"));

    try {
      await syncStockPrices();
    } finally {
      vi.useRealTimers();
    }

    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.fetchAllStockPrices).toHaveBeenCalledTimes(1);
  });

  it("★ TZ 경계: KST 일요일 08:00 (UTC 토요일 23:00) → 주말로 스킵", async () => {
    vi.useFakeTimers();
    // 2025-04-20 08:00 KST = 2025-04-19 23:00 UTC (UTC는 토요일, KST는 일요일 — 둘 다 주말)
    vi.setSystemTime(new Date("2025-04-19T23:00:00Z"));

    try {
      await syncStockPrices();
    } finally {
      vi.useRealTimers();
    }

    expect(mocks.findMany).toHaveBeenCalledTimes(0);
    expect(mocks.fetchAllStockPrices).toHaveBeenCalledTimes(0);
  });
});
