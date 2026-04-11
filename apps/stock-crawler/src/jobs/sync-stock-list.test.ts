import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * syncStockList 는 prisma 와 fetchAllStocks 에 의존한다. 둘 다 vi.mock 으로 스텁.
 * vi.mock factory 는 파일 상위로 hoist 되므로 외부 변수 참조가 불가 → 모든 훅을
 * vi.hoisted 로 공유한다.
 */

const mocks = vi.hoisted(() => {
  return {
    upsert: vi.fn(),
    updateMany: vi.fn(),
    fetchAllStocks: vi.fn(),
  };
});

// prisma 만 mock 하고 나머지 export 는 실제 구현을 통과시킨다.
vi.mock("@seedbook/database", async () => {
  const actual = await vi.importActual<typeof import("@seedbook/database")>("@seedbook/database");
  return {
    ...actual,
    prisma: {
      stock: {
        upsert: mocks.upsert,
        updateMany: mocks.updateMany,
      },
    },
  };
});

vi.mock("../sources/naver.js", () => ({
  fetchAllStocks: mocks.fetchAllStocks,
}));

// 동적 import: vi.mock 가 적용된 후에만 대상 모듈을 읽어야 한다.
const { syncStockList } = await import("./sync-stock-list.js");

function makeStock(market: string, index: number) {
  return {
    market,
    ticker: `${market === "KOSPI" ? "0" : "1"}${String(index).padStart(5, "0")}`,
    name: `${market}-${index}`,
    currency: "KRW",
  };
}

function makeStocks(market: string, count: number) {
  return Array.from({ length: count }, (_, i) => makeStock(market, i));
}

describe("syncStockList", () => {
  beforeEach(() => {
    // 매 테스트마다 implementation 을 다시 심어서 restoreAllMocks / mockReset 이
    // 다른 테스트에 영향을 주지 않도록 한다.
    mocks.upsert.mockReset().mockResolvedValue(undefined);
    mocks.updateMany.mockReset().mockResolvedValue({ count: 0 });
    mocks.fetchAllStocks.mockReset();
  });

  it("정상: 200+200 입력 → upsert 400회, KOSPI/KOSDAQ 각자 deactivation", async () => {
    const stocks = [...makeStocks("KOSPI", 200), ...makeStocks("KOSDAQ", 200)];
    mocks.fetchAllStocks.mockResolvedValue(stocks);

    await syncStockList();

    expect(mocks.upsert).toHaveBeenCalledTimes(400);
    // KOSPI, KOSDAQ 각 1번씩 deactivation
    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
    const markets = mocks.updateMany.mock.calls.map(
      ([arg]: [{ where: { market: string } }]) => arg.where.market
    );
    expect(new Set(markets)).toEqual(new Set(["KOSPI", "KOSDAQ"]));
  });

  it("빈 결과: upsert / updateMany 호출 0회 (조기 return)", async () => {
    mocks.fetchAllStocks.mockResolvedValue([]);

    await syncStockList();

    expect(mocks.upsert).toHaveBeenCalledTimes(0);
    expect(mocks.updateMany).toHaveBeenCalledTimes(0);
  });

  it("★ Deactivation 가드: 50개 반환 시 upsert 는 실행, updateMany 는 스킵", async () => {
    // KOSPI 50개만 → MIN_STOCKS_PER_MARKET_FOR_DEACTIVATION(100) 미만
    const stocks = makeStocks("KOSPI", 50);
    mocks.fetchAllStocks.mockResolvedValue(stocks);

    await syncStockList();

    expect(mocks.upsert).toHaveBeenCalledTimes(50);
    // 50 < 100 이므로 KOSPI deactivation 스킵
    expect(mocks.updateMany).toHaveBeenCalledTimes(0);
  });

  it("혼합: KOSPI 200 + KOSDAQ 50 → KOSPI 만 deactivation 실행", async () => {
    const stocks = [...makeStocks("KOSPI", 200), ...makeStocks("KOSDAQ", 50)];
    mocks.fetchAllStocks.mockResolvedValue(stocks);

    await syncStockList();

    expect(mocks.upsert).toHaveBeenCalledTimes(250);
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    const [arg] = mocks.updateMany.mock.calls[0]! as [{ where: { market: string } }];
    expect(arg.where.market).toBe("KOSPI");
  });

  it("배치 사이즈: 250 입력 시 upsert 는 병렬 배치로 나뉘어 호출됨 (총 250회)", async () => {
    const stocks = makeStocks("KOSPI", 250);
    mocks.fetchAllStocks.mockResolvedValue(stocks);

    await syncStockList();

    // 각 stock 마다 upsert 한 번 → 총 250
    expect(mocks.upsert).toHaveBeenCalledTimes(250);
    // 250 ≥ 100 이므로 KOSPI deactivation 실행
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
  });
});
