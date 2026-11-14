import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * syncStockList 는 DB(drizzle `db`) 와 fetchAllStocks 에 의존한다. 둘 다 vi.mock 으로 스텁.
 * `db` 는 쓰는 체인(insert → values → onConflictDoUpdate, update → set → where → returning)만
 * 흉내 내고 호출을 기록한다. vi.mock factory 는 파일 상위로 hoist 되므로 공유 상태는
 * vi.hoisted 로 둔다.
 */

const mocks = vi.hoisted(() => {
  return {
    /** insert 배치마다 넣은 행 */
    insertedBatches: [] as unknown[][],
    /** 비활성화 update 의 where 조건 */
    deactivations: [] as unknown[],
    fetchAllStocks: vi.fn(),
  };
});

// db 만 mock 하고 나머지 export (schema 등) 는 실제 구현을 통과시킨다.
vi.mock("@seedbook/database", async () => {
  const actual = await vi.importActual<typeof import("@seedbook/database")>("@seedbook/database");
  const db = {
    insert: () => ({
      values: (rows: unknown[]) => ({
        onConflictDoUpdate: async () => {
          mocks.insertedBatches.push(rows);
        },
      }),
    }),
    update: () => ({
      set: () => ({
        where: (where: unknown) => ({
          returning: async () => {
            mocks.deactivations.push(where);
            return [];
          },
        }),
      }),
    }),
  };
  return { ...actual, db };
});

vi.mock("../sources/naver.js", () => ({
  fetchAllStocks: mocks.fetchAllStocks,
}));

const dialect = new PgDialect();

/** 비활성화한 시장 — where 조건의 첫 파라미터가 시장이다. */
function deactivatedMarkets(): unknown[] {
  return mocks.deactivations.map((where) => dialect.sqlToQuery(where as SQL).params[0]);
}

const upsertedRowCount = () => mocks.insertedBatches.reduce((sum, rows) => sum + rows.length, 0);

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
    mocks.insertedBatches.length = 0;
    mocks.deactivations.length = 0;
    mocks.fetchAllStocks.mockReset();
  });

  it("정상: 200+200 입력 → 400행 upsert, KOSPI/KOSDAQ 각자 deactivation", async () => {
    const stocks = [...makeStocks("KOSPI", 200), ...makeStocks("KOSDAQ", 200)];
    mocks.fetchAllStocks.mockResolvedValue(stocks);

    await syncStockList();

    expect(upsertedRowCount()).toBe(400);
    expect(new Set(deactivatedMarkets())).toEqual(new Set(["KOSPI", "KOSDAQ"]));
  });

  it("빈 결과: upsert / deactivation 0회 (조기 return)", async () => {
    mocks.fetchAllStocks.mockResolvedValue([]);

    await syncStockList();

    expect(mocks.insertedBatches).toHaveLength(0);
    expect(mocks.deactivations).toHaveLength(0);
  });

  it("★ Deactivation 가드: 50개 반환 시 upsert 는 실행, deactivation 은 스킵", async () => {
    // KOSPI 50개만 → MIN_STOCKS_PER_MARKET_FOR_DEACTIVATION(100) 미만
    mocks.fetchAllStocks.mockResolvedValue(makeStocks("KOSPI", 50));

    await syncStockList();

    expect(upsertedRowCount()).toBe(50);
    expect(mocks.deactivations).toHaveLength(0);
  });

  it("혼합: KOSPI 200 + KOSDAQ 50 → KOSPI 만 deactivation 실행", async () => {
    const stocks = [...makeStocks("KOSPI", 200), ...makeStocks("KOSDAQ", 50)];
    mocks.fetchAllStocks.mockResolvedValue(stocks);

    await syncStockList();

    expect(upsertedRowCount()).toBe(250);
    expect(deactivatedMarkets()).toEqual(["KOSPI"]);
  });

  it("배치 사이즈: 250 입력 시 100개씩 3번에 나눠 upsert 한다", async () => {
    mocks.fetchAllStocks.mockResolvedValue(makeStocks("KOSPI", 250));

    await syncStockList();

    expect(mocks.insertedBatches.map((rows) => rows.length)).toEqual([100, 100, 50]);
    // 250 ≥ 100 이므로 KOSPI deactivation 실행
    expect(deactivatedMarkets()).toEqual(["KOSPI"]);
  });
});
