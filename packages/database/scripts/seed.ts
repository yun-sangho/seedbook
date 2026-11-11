/**
 * seed fixture → DB 재생.
 *
 * `capture-seed.ts` 가 떠 놓은 `seed-data/stocks.json`, `stock-prices.json` 을
 * 읽어 Drizzle insert + onConflictDoNothing 으로 적재한다. 이미 존재하는 행은
 * 건드리지 않는다 — fixture 는 "최소한 이만큼은 있어야 함" 의미이고, 크롤러가
 * 만든 더 최신 값을 시드가 뒤집지 않도록.
 *
 * 프로덕션 가드: NODE_ENV=production 에서는 기본적으로 no-op 이다. 강제로
 * 돌리려면 ALLOW_PROD_SEED=1.
 */

import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import path, { resolve } from "path";
import { db, schema } from "../src/client";
import { DEV_SESSION_ID, DEV_USER_EMAIL, DEV_USER_ID } from "../src/dev-auth";
import { ensureDevAuth } from "../src/ensure-dev-auth";
import { seedDevUserData } from "./dev-user-data";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_DATA_DIR = resolve(__dirname, "../seed-data");
const CHUNK_SIZE = 5000;

type StockFixture = {
  market: string;
  ticker: string;
  name: string;
  currency: string;
  sector: string | null;
  /** 이 필드가 생기기 전에 캡처한 fixture 에는 없다. */
  securityType?: string | null;
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

function shouldSkip(): boolean {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SEED !== "1") {
    console.log("[seed] production detected, skipping (set ALLOW_PROD_SEED=1 to force)");
    return true;
  }
  return false;
}

async function seedStocks(stocks: StockFixture[]): Promise<void> {
  const started = Date.now();
  let inserted = 0;
  for (let i = 0; i < stocks.length; i += CHUNK_SIZE) {
    const chunk = stocks.slice(i, i + CHUNK_SIZE);
    const rows = chunk.map((s) => ({
      market: s.market,
      ticker: s.ticker,
      name: s.name,
      currency: s.currency,
      sector: s.sector,
      securityType: s.securityType ?? null,
      isActive: s.isActive,
      updatedAt: new Date(),
    }));
    const result = await db.insert(schema.stock).values(rows).onConflictDoNothing().returning({
      market: schema.stock.market,
    });
    inserted += result.length;
  }
  console.log(
    `[seed] stocks: ${inserted} inserted, ${stocks.length - inserted} skipped (existing) in ${Date.now() - started}ms`
  );
}

async function seedStockPrices(prices: StockPriceFixture[]): Promise<void> {
  const started = Date.now();
  let inserted = 0;
  for (let i = 0; i < prices.length; i += CHUNK_SIZE) {
    const chunk = prices.slice(i, i + CHUNK_SIZE);
    const rows = chunk.map((p) => ({
      stockMarket: p.stockMarket,
      stockTicker: p.stockTicker,
      date: new Date(p.date),
      open: BigInt(p.open),
      high: BigInt(p.high),
      low: BigInt(p.low),
      close: BigInt(p.close),
      volume: BigInt(p.volume),
      marketCap: p.marketCap === null ? null : BigInt(p.marketCap),
      change: p.change === null ? null : BigInt(p.change),
    }));
    const result = await db
      .insert(schema.stockPrice)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: schema.stockPrice.id });
    inserted += result.length;
  }
  console.log(
    `[seed] stock prices: ${inserted} inserted, ${prices.length - inserted} skipped (existing) in ${Date.now() - started}ms`
  );
}

async function seedDevAuth(): Promise<void> {
  await ensureDevAuth();
  console.log(`[seed] dev auth ensured: user=${DEV_USER_EMAIL}, session=${DEV_SESSION_ID}`);
}

async function main(): Promise<void> {
  if (shouldSkip()) return;

  if (process.env.NODE_ENV === "development") {
    await seedDevAuth();
    await seedDevUserData(DEV_USER_ID);
  }

  const stocksPath = resolve(SEED_DATA_DIR, "stocks.json");
  const pricesPath = resolve(SEED_DATA_DIR, "stock-prices.json");

  if (!existsSync(stocksPath)) {
    console.log(`[seed] no fixture at ${stocksPath}, skipping`);
    return;
  }

  const stocks: StockFixture[] = JSON.parse(readFileSync(stocksPath, "utf8"));
  await seedStocks(stocks);

  if (existsSync(pricesPath)) {
    const prices: StockPriceFixture[] = JSON.parse(readFileSync(pricesPath, "utf8"));
    await seedStockPrices(prices);
  } else {
    console.log(`[seed] no price fixture at ${pricesPath}, skipping prices`);
  }

  console.log("[seed] done");
}

main()
  .catch((e) => {
    console.error("[seed] failed:", e);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
