/**
 * DB → seed fixture 덤프.
 *
 * 실행 중인 DB 의 `public.Stock` 전체와 `public.StockPrice` 최근 N 거래일을
 * JSON 파일로 떠서 `packages/database/prisma/seed-data/` 에 기록한다.
 * 이후 seed.ts 가 이 파일을 읽어 upsert 로 재생한다.
 *
 * 실행:
 *   pnpm --filter @seedbook/database db:seed:capture
 *
 * Docker 안에서 실행하는 걸 권장한다 — Postgres 는 호스트에 포트를 노출하지
 * 않으므로 호스트에서 실행하려면 DATABASE_URL 을 따로 세팅해야 한다.
 *   docker compose -f docker-compose.dev.yml exec stock-crawler \
 *     pnpm --filter @seedbook/database db:seed:capture
 *
 * 환경 변수:
 *   SEED_PRICE_DAYS — StockPrice 를 최근 N 거래일만 덤프 (기본 5)
 */

import { existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { prisma } from "../src/client";

const SEED_PRICE_DAYS = Number(process.env.SEED_PRICE_DAYS ?? "5");
const SEED_DATA_DIR = resolve(__dirname, "../prisma/seed-data");

// JSON.stringify 는 BigInt 를 바로 못 담으므로 문자열로 직렬화한다.
// Date 는 toISOString() 이 기본 동작이라 그대로 둔다.
function replacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

async function main(): Promise<void> {
  if (!Number.isFinite(SEED_PRICE_DAYS) || SEED_PRICE_DAYS < 0) {
    throw new Error(
      `SEED_PRICE_DAYS must be a non-negative integer, got ${process.env.SEED_PRICE_DAYS}`
    );
  }

  if (!existsSync(SEED_DATA_DIR)) {
    mkdirSync(SEED_DATA_DIR, { recursive: true });
  }

  console.log("[capture] fetching Stock rows...");
  // DB 가 관리하는 필드(createdAt/updatedAt) 는 제외해서 재캡처 시 diff 노이즈를 줄인다.
  const stocks = await prisma.stock.findMany({
    orderBy: [{ market: "asc" }, { ticker: "asc" }],
    select: {
      market: true,
      ticker: true,
      name: true,
      currency: true,
      sector: true,
      isActive: true,
    },
  });
  console.log(`[capture] ${stocks.length} stocks`);

  // 최근 N 거래일의 distinct date 를 먼저 구한다 (주말/공휴일 스킵한 결과).
  // groupBy 로 서버 사이드 distinct + orderBy + take 한 번에 처리.
  const dateGroups =
    SEED_PRICE_DAYS > 0
      ? await prisma.stockPrice.groupBy({
          by: ["date"],
          orderBy: { date: "desc" },
          take: SEED_PRICE_DAYS,
        })
      : [];

  const cutoff = dateGroups.at(-1)?.date;
  // auto-increment `id` 는 캡처마다 바뀌므로 제외 — 재생 시에도 무시하고 대상 DB
  // 시퀀스가 새 id 를 발급하게 한다.
  const prices = cutoff
    ? await prisma.stockPrice.findMany({
        where: { date: { gte: cutoff } },
        orderBy: [{ date: "asc" }, { stockMarket: "asc" }, { stockTicker: "asc" }],
        select: {
          stockMarket: true,
          stockTicker: true,
          date: true,
          open: true,
          high: true,
          low: true,
          close: true,
          volume: true,
          marketCap: true,
          change: true,
        },
      })
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
    JSON.stringify(prices, replacer, 2) + "\n"
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
  .finally(() => prisma.$disconnect());
