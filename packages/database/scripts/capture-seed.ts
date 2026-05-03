/**
 * DB → seed fixture 덤프.
 *
 * 실행 중인 DB 의 `seedbook.Stock` 전체와 `seedbook.StockPrice` 최근 N 거래일을
 * JSON 파일로 떠서 `packages/database/seed-data/` 에 기록한다. 이후 seed.ts 가
 * 이 파일을 읽어 onConflictDoNothing 으로 재생한다.
 *
 * 실행:
 *   pnpm --filter @seedbook/database db:seed:capture
 *
 * 환경 변수:
 *   SEED_PRICE_DAYS — StockPrice 를 최근 N 거래일만 덤프 (기본 5)
 */

import { existsSync, mkdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "node:url";
import path, { resolve } from "path";
import { asc, desc, gte } from "drizzle-orm";
import { db, schema } from "../src/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_PRICE_DAYS = Number(process.env.SEED_PRICE_DAYS ?? "5");
const SEED_DATA_DIR = resolve(__dirname, "../seed-data");

function replacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

async function main(): Promise<void> {
  if (!Number.isFinite(SEED_PRICE_DAYS) || SEED_PRICE_DAYS < 0) {
    throw new Error(
      `SEED_PRICE_DAYS must be a non-negative integer, got ${process.env.SEED_PRICE_DAYS}`,
    );
  }

  if (!existsSync(SEED_DATA_DIR)) {
    mkdirSync(SEED_DATA_DIR, { recursive: true });
  }

  console.log("[capture] fetching Stock rows...");
  const stocks = await db
    .select({
      market: schema.stock.market,
      ticker: schema.stock.ticker,
      name: schema.stock.name,
      currency: schema.stock.currency,
      sector: schema.stock.sector,
      isActive: schema.stock.isActive,
    })
    .from(schema.stock)
    .orderBy(asc(schema.stock.market), asc(schema.stock.ticker));
  console.log(`[capture] ${stocks.length} stocks`);

  // 최근 N 거래일의 distinct date 를 먼저 구한다 (주말/공휴일 스킵한 결과).
  const dateGroups =
    SEED_PRICE_DAYS > 0
      ? await db
          .selectDistinct({ date: schema.stockPrice.date })
          .from(schema.stockPrice)
          .orderBy(desc(schema.stockPrice.date))
          .limit(SEED_PRICE_DAYS)
      : [];

  const cutoff = dateGroups.at(-1)?.date;
  const prices = cutoff
    ? await db
        .select({
          stockMarket: schema.stockPrice.stockMarket,
          stockTicker: schema.stockPrice.stockTicker,
          date: schema.stockPrice.date,
          open: schema.stockPrice.open,
          high: schema.stockPrice.high,
          low: schema.stockPrice.low,
          close: schema.stockPrice.close,
          volume: schema.stockPrice.volume,
          marketCap: schema.stockPrice.marketCap,
          change: schema.stockPrice.change,
        })
        .from(schema.stockPrice)
        .where(gte(schema.stockPrice.date, cutoff))
        .orderBy(
          asc(schema.stockPrice.date),
          asc(schema.stockPrice.stockMarket),
          asc(schema.stockPrice.stockTicker),
        )
    : [];
  console.log(`[capture] ${prices.length} prices over ${dateGroups.length} trading days`);

  const meta = {
    capturedAt: new Date().toISOString(),
    priceDaysIncluded: dateGroups.length,
    stockCount: stocks.length,
    priceRowCount: prices.length,
  };

  writeFileSync(resolve(SEED_DATA_DIR, "stocks.json"), JSON.stringify(stocks, replacer, 2) + "\n");
  writeFileSync(
    resolve(SEED_DATA_DIR, "stock-prices.json"),
    JSON.stringify(prices, replacer, 2) + "\n",
  );
  writeFileSync(resolve(SEED_DATA_DIR, "meta.json"), JSON.stringify(meta, null, 2) + "\n");

  console.log(`[capture] wrote fixtures to ${SEED_DATA_DIR}`);
  console.log("[capture] meta:", meta);
}

main()
  .catch((e) => {
    console.error("[capture] failed:", e);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
