/**
 * seed fixture → DB 재생 (`prisma db seed` / `pnpm db:seed`).
 *
 * `capture-seed.ts` 가 떠 놓은 `seed-data/stocks.json`, `stock-prices.json` 을
 * 읽어 `public.Stock`, `public.StockPrice` 에 createMany + skipDuplicates 로
 * 적재한다. 이미 존재하는 행은 건드리지 않는다 — fixture 는 "최소한 이만큼은
 * 있어야 함" 의미이고, 크롤러가 만든 더 최신 값을 시드가 뒤집지 않도록.
 *
 * createMany 는 개별 upsert 루프 대비 몇 배 빠르고 (round-trip 1회), 멱등성은
 * `skipDuplicates: true` 로 확보한다. 내부적으로 `INSERT ... ON CONFLICT DO NOTHING`
 * 이 붙어 기존 행은 조용히 건너뛴다.
 *
 * 프로덕션 가드: NODE_ENV=production 에서는 기본적으로 no-op 이다. 강제로
 * 돌리려면 ALLOW_PROD_SEED=1 설정.
 *
 * fixture 파일이 없으면 "초기 캡처 전" 상태로 간주해 에러 없이 스킵한다 —
 * seed-data/ 디렉토리가 비어 있어도 컨테이너가 안 뜨는 사태를 막는다.
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { prisma } from "../src/client";
import {
  DEV_SESSION_ID,
  DEV_SESSION_TOKEN,
  DEV_USER_EMAIL,
  DEV_USER_ID,
  DEV_USER_NAME,
} from "../src/dev-auth";

const SEED_DATA_DIR = resolve(__dirname, "seed-data");
// Postgres 단일 트랜잭션 파라미터 한도 (65535) 를 안전하게 피하는 청크 크기.
// Stock 행당 컬럼 7개, StockPrice 행당 10개 기준 → 5000 건씩이면 최대 5만 파라미터.
const CHUNK_SIZE = 5000;

type StockFixture = {
  market: string;
  ticker: string;
  name: string;
  currency: string;
  sector: string | null;
  isActive: boolean;
  // capture 는 createdAt/updatedAt 도 함께 떠 놓지만 재생 시엔 의도적으로 무시.
  // 삽입된 행은 DB `@default(now())` / `@updatedAt` 에 의해 "재생된 시각" 을 가진다.
};

type StockPriceFixture = {
  stockMarket: string;
  stockTicker: string;
  date: string; // ISO
  open: string; // BigInt serialized
  high: string;
  low: string;
  close: string;
  volume: string;
  marketCap: string | null;
  change: string | null;
  // fixture 의 `id` 는 원본 DB 의 auto-increment 값이라 시퀀스 충돌 위험.
  // 재생 시엔 무시하고 대상 DB 가 새 id 를 발급하게 한다.
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
    const chunk = stocks.slice(i, i + CHUNK_SIZE).map((s) => ({
      market: s.market,
      ticker: s.ticker,
      name: s.name,
      currency: s.currency,
      sector: s.sector,
      isActive: s.isActive,
    }));
    const result = await prisma.stock.createMany({ data: chunk, skipDuplicates: true });
    inserted += result.count;
  }
  const skipped = stocks.length - inserted;
  console.log(
    `[seed] stocks: ${inserted} inserted, ${skipped} skipped (existing) in ${Date.now() - started}ms`
  );
}

async function seedStockPrices(prices: StockPriceFixture[]): Promise<void> {
  const started = Date.now();
  let inserted = 0;
  for (let i = 0; i < prices.length; i += CHUNK_SIZE) {
    const chunk = prices.slice(i, i + CHUNK_SIZE).map((p) => ({
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
    const result = await prisma.stockPrice.createMany({ data: chunk, skipDuplicates: true });
    inserted += result.count;
  }
  const skipped = prices.length - inserted;
  console.log(
    `[seed] stock prices: ${inserted} inserted, ${skipped} skipped (existing) in ${Date.now() - started}ms`
  );
}

async function seedDevAuth(): Promise<void> {
  // 개발 환경에서만 고정된 dev 유저 + 세션을 보장한다. `dev-login` 라우트는
  // Better Auth API 를 타지 않고 이 seed 가 만들어 둔 세션 토큰을 쿠키로만
  // 내려주는 방식이라, 두 쪽의 ID/토큰이 맞물려야 동작한다. 상수는
  // `packages/database/src/dev-auth.ts` 에서 공유한다.
  //
  // 세션 만료는 먼 미래로 둔다 — 로컬 dev 에서 세션 갱신 플로우까지 재현할
  // 필요가 없고, 만료 후 재로그인을 강제하는 게 오히려 방해가 된다.
  const now = new Date();
  const farFuture = new Date("2100-01-01T00:00:00Z");

  await prisma.user.upsert({
    where: { id: DEV_USER_ID },
    create: {
      id: DEV_USER_ID,
      email: DEV_USER_EMAIL,
      name: DEV_USER_NAME,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    update: {},
  });

  await prisma.session.upsert({
    where: { id: DEV_SESSION_ID },
    create: {
      id: DEV_SESSION_ID,
      userId: DEV_USER_ID,
      token: DEV_SESSION_TOKEN,
      expiresAt: farFuture,
      createdAt: now,
      updatedAt: now,
    },
    update: { expiresAt: farFuture },
  });

  console.log(`[seed] dev auth ensured: user=${DEV_USER_EMAIL}, session=${DEV_SESSION_ID}`);
}

async function main(): Promise<void> {
  if (shouldSkip()) return;

  if (process.env.NODE_ENV === "development") {
    await seedDevAuth();
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
  .finally(() => prisma.$disconnect());
