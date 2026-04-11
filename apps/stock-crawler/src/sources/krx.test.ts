import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchAllStocksWithPrices,
  parsePriceData,
  parseStockList,
  type KrxStockItem,
} from "./krx.js";

function item(overrides: Partial<KrxStockItem> = {}): KrxStockItem {
  return {
    ISU_CD: "KR7005930003",
    ISU_SRT_CD: "005930",
    ISU_NM: "삼성전자",
    MKT_NM: "KOSPI",
    SECT_TP_NM: "전기전자",
    TDD_CLSPRC: "70,000",
    TDD_OPNPRC: "69,000",
    TDD_HGPRC: "70,500",
    TDD_LWPRC: "68,500",
    ACC_TRDVOL: "12,345,678",
    MKTCAP: "418,000,000,000,000",
    CMPPREVDD_PRC: "1,000",
    LIST_DD: "19750611",
    ...overrides,
  };
}

describe("parseStockList", () => {
  it("KRX 아이템을 { market, ticker, name, currency, sector } 로 매핑", () => {
    const result = parseStockList([
      item({ ISU_SRT_CD: "005930", ISU_NM: "삼성전자", MKT_NM: "KOSPI" }),
      item({
        ISU_SRT_CD: "000660",
        ISU_NM: "SK하이닉스",
        MKT_NM: "KOSPI",
        SECT_TP_NM: "",
      }),
    ]);

    expect(result).toEqual([
      {
        market: "KOSPI",
        ticker: "005930",
        name: "삼성전자",
        currency: "KRW",
        sector: "전기전자",
      },
      {
        market: "KOSPI",
        ticker: "000660",
        name: "SK하이닉스",
        currency: "KRW",
        sector: null, // 빈 문자열은 null 로
      },
    ]);
  });
});

describe("parsePriceData", () => {
  it("종가 0 인 항목은 필터링 (상장 전/거래 정지)", () => {
    const result = parsePriceData(
      [
        item({ ISU_SRT_CD: "005930", TDD_CLSPRC: "70,000" }),
        item({ ISU_SRT_CD: "000001", TDD_CLSPRC: "0" }),
        item({ ISU_SRT_CD: "000002", TDD_CLSPRC: "-" }),
      ],
      new Date("2025-01-02")
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.stockTicker).toBe("005930");
  });

  it("콤마 포함 숫자를 bigint 로 정확히 파싱", () => {
    const [row] = parsePriceData(
      [
        item({
          TDD_CLSPRC: "70,000",
          TDD_OPNPRC: "69,000",
          TDD_HGPRC: "70,500",
          TDD_LWPRC: "68,500",
          ACC_TRDVOL: "12,345,678",
          MKTCAP: "418,000,000,000,000",
          CMPPREVDD_PRC: "1,000",
        }),
      ],
      new Date("2025-01-02")
    );

    expect(row!.open).toBe(69_000n);
    expect(row!.high).toBe(70_500n);
    expect(row!.low).toBe(68_500n);
    expect(row!.close).toBe(70_000n);
    expect(row!.volume).toBe(12_345_678n);
    expect(row!.marketCap).toBe(418_000_000_000_000n);
    expect(row!.change).toBe(1_000n);
  });
});

describe("fetchAllStocksWithPrices (shape 검증)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("OutBlock_1 이 배열이 아니면 throw", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ OutBlock_1: "not-an-array" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchAllStocksWithPrices(new Date("2025-01-02"));
    const settled = promise.catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await settled;

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("KRX 응답 포맷 이상");
  });
});
