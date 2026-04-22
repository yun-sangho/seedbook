import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

/**
 * packages/database/prisma/seed-data/ 의 JSON fixture 무결성 검증.
 *
 * fixture 는 실 크롤러 산출물을 캡처한 것이므로 이 테스트는 "실 데이터가 들어왔는지"
 * 를 검증하는 smoke 수준 — BigInt 직렬화 포맷, 참조 정합성(price → stock),
 * 기본 스키마 형태만 본다. 상세 비즈니스 규칙은 크롤러 쪽 단위 테스트 몫.
 *
 * fixture 파일이 아직 커밋되지 않은 상태에선 전부 skip — 리포 초기 상태 CI 가
 * 빨갛게 뜨지 않도록.
 */

const SEED_DATA_DIR = resolve(__dirname, "../../../packages/database/prisma/seed-data");

const STOCKS_PATH = resolve(SEED_DATA_DIR, "stocks.json");
const PRICES_PATH = resolve(SEED_DATA_DIR, "stock-prices.json");
const META_PATH = resolve(SEED_DATA_DIR, "meta.json");

type StockFixture = {
  market: string;
  ticker: string;
  name: string;
  currency: string;
  sector: string | null;
  isActive: boolean;
};

type StockPriceFixture = {
  stockMarket: string;
  stockTicker: string;
  date: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  marketCap: string | null;
  change: string | null;
};

const ALLOWED_MARKETS = new Set(["KOSPI", "KOSDAQ", "KONEX", "NASDAQ", "NYSE"]);
// KR 티커는 6자리 alphanumeric — 일반주는 숫자만 (005930), 우선주/워런트 등은
// 숫자+대문자 suffix (38380K, 0001A0) 가 섞인다.
const KR_TICKER_RE = /^[0-9A-Z]{6}$/;
const US_TICKER_RE = /^[A-Z][A-Z0-9.\-]*$/;

function readStocks(): StockFixture[] {
  return JSON.parse(readFileSync(STOCKS_PATH, "utf8"));
}

function readPrices(): StockPriceFixture[] {
  return JSON.parse(readFileSync(PRICES_PATH, "utf8"));
}

describe.skipIf(!existsSync(STOCKS_PATH))("seed fixtures", () => {
  describe("stocks.json", () => {
    it("is a non-empty array", () => {
      const stocks = readStocks();
      expect(Array.isArray(stocks)).toBe(true);
      expect(stocks.length).toBeGreaterThan(0);
    });

    it("every market is in the allowed set", () => {
      const bad = readStocks().filter((s) => !ALLOWED_MARKETS.has(s.market));
      expect(bad).toEqual([]);
    });

    it("every ticker matches the KR 6-digit or US alpha regex", () => {
      const bad = readStocks().filter((s) => {
        const isKr = s.market === "KOSPI" || s.market === "KOSDAQ" || s.market === "KONEX";
        return isKr ? !KR_TICKER_RE.test(s.ticker) : !US_TICKER_RE.test(s.ticker);
      });
      expect(bad).toEqual([]);
    });

    it("has no duplicate (market, ticker)", () => {
      const seen = new Set<string>();
      const dupes: string[] = [];
      for (const s of readStocks()) {
        const key = `${s.market}:${s.ticker}`;
        if (seen.has(key)) dupes.push(key);
        seen.add(key);
      }
      expect(dupes).toEqual([]);
    });
  });

  describe.skipIf(!existsSync(PRICES_PATH))("stock-prices.json", () => {
    it("is an array (may be empty if SEED_PRICE_DAYS=0)", () => {
      expect(Array.isArray(readPrices())).toBe(true);
    });

    it("every (stockMarket, stockTicker) exists in stocks.json", () => {
      const stockKeys = new Set(readStocks().map((s) => `${s.market}:${s.ticker}`));
      const orphans = readPrices().filter(
        (p) => !stockKeys.has(`${p.stockMarket}:${p.stockTicker}`)
      );
      expect(orphans.slice(0, 5)).toEqual([]);
    });

    it("every BigInt field parses", () => {
      for (const p of readPrices()) {
        expect(() => BigInt(p.open)).not.toThrow();
        expect(() => BigInt(p.high)).not.toThrow();
        expect(() => BigInt(p.low)).not.toThrow();
        expect(() => BigInt(p.close)).not.toThrow();
        expect(() => BigInt(p.volume)).not.toThrow();
        if (p.marketCap !== null) expect(() => BigInt(p.marketCap as string)).not.toThrow();
        if (p.change !== null) expect(() => BigInt(p.change as string)).not.toThrow();
      }
    });

    it("every date parses to a valid Date", () => {
      const invalid = readPrices().filter((p) => Number.isNaN(new Date(p.date).getTime()));
      expect(invalid).toEqual([]);
    });
  });

  describe.skipIf(!existsSync(META_PATH))("meta.json", () => {
    it("has a valid capturedAt timestamp and counts matching the fixture files", () => {
      const meta = JSON.parse(readFileSync(META_PATH, "utf8")) as {
        capturedAt: string;
        priceDaysIncluded: number;
        stockCount: number;
        priceRowCount: number;
      };
      expect(Number.isNaN(new Date(meta.capturedAt).getTime())).toBe(false);
      expect(meta.stockCount).toBe(readStocks().length);
      if (existsSync(PRICES_PATH)) {
        expect(meta.priceRowCount).toBe(readPrices().length);
      }
    });
  });
});
