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
import {
  DEV_SESSION_ID,
  DEV_SESSION_TOKEN,
  DEV_USER_EMAIL,
  DEV_USER_ID,
  DEV_USER_NAME,
} from "../src/dev-auth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_DATA_DIR = resolve(__dirname, "../seed-data");
const CHUNK_SIZE = 5000;

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
      isActive: s.isActive,
      updatedAt: new Date(),
    }));
    const result = await db.insert(schema.stock).values(rows).onConflictDoNothing().returning({
      market: schema.stock.market,
    });
    inserted += result.length;
  }
  console.log(
    `[seed] stocks: ${inserted} inserted, ${stocks.length - inserted} skipped (existing) in ${Date.now() - started}ms`,
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
    `[seed] stock prices: ${inserted} inserted, ${prices.length - inserted} skipped (existing) in ${Date.now() - started}ms`,
  );
}

// ─── User-data fixture ──────────────────────────────────────────────────────

type InvestmentFixture = {
  id: string;
  accountName: string;
  accountType: string;
  currency: string;
  initialInvestment: number;
  currentValue: number;
  note?: string;
  color: string;
  records?: { date: string; initialInvestment: number; currentValue: number }[];
  holdings?: {
    id: string;
    market: string;
    ticker: string;
    name: string;
    currency: string;
    quantity: number;
    memo?: string;
  }[];
  cashItems?: { id: string; label: string; amount: number }[];
};

type SavingsFixture = {
  id: string;
  accountName: string;
  accountType: string;
  currency: string;
  balance: number;
  interestRate?: number;
  note?: string;
  color: string;
  records?: { date: string; balance: number }[];
};

type DebtFixture = {
  id: string;
  loanName: string;
  loanType: string;
  lender: string;
  amount: number;
  interestRate: number;
  maturityDate?: string;
  monthlyPayment: number;
  note?: string;
};

type RealAssetFixture = {
  id: string;
  assetName: string;
  assetType: string;
  currentValue: number;
  purchaseValue: number;
  purchaseDate?: string;
  note?: string;
  color: string;
};

type ProgressPointFixture = {
  date: string;
  totalAssets: number;
  netAssets: number;
  investments: number;
  savings: number;
  realAssets: number;
  loans: number;
};

type UserDataFixture = {
  investments?: InvestmentFixture[];
  savings?: SavingsFixture[];
  debts?: DebtFixture[];
  realAssets?: RealAssetFixture[];
  progressPoints?: ProgressPointFixture[];
};

function parseDate(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function seedUserData(userId: string): Promise<void> {
  const fixturePath = resolve(SEED_DATA_DIR, "user-data.json");
  if (!existsSync(fixturePath)) {
    console.log(`[seed] no user-data fixture at ${fixturePath}, skipping`);
    return;
  }
  const fixture: UserDataFixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  const started = Date.now();
  const now = new Date();

  const investments = fixture.investments ?? [];
  if (investments.length > 0) {
    await db
      .insert(schema.investmentAccount)
      .values(
        investments.map((inv) => ({
          id: inv.id,
          userId,
          accountName: inv.accountName,
          accountType: inv.accountType,
          currency: inv.currency,
          initialInvestment: BigInt(inv.initialInvestment),
          currentValue: BigInt(inv.currentValue),
          note: inv.note ?? "",
          color: inv.color,
          updatedAt: now,
        })),
      )
      .onConflictDoNothing();

    const recordRows = investments.flatMap((inv) =>
      (inv.records ?? [])
        .map((r) => {
          const date = parseDate(r.date);
          return date
            ? {
                accountId: inv.id,
                date,
                initialInvestment: BigInt(r.initialInvestment),
                currentValue: BigInt(r.currentValue),
              }
            : null;
        })
        .filter((r): r is NonNullable<typeof r> => r !== null),
    );
    if (recordRows.length > 0) {
      await db.insert(schema.investmentRecord).values(recordRows).onConflictDoNothing();
    }

    const holdingRows = investments.flatMap((inv) =>
      (inv.holdings ?? []).map((h) => ({
        id: h.id,
        accountId: inv.id,
        market: h.market,
        ticker: h.ticker,
        name: h.name,
        currency: h.currency,
        quantity: h.quantity,
        memo: h.memo ?? "",
      })),
    );
    if (holdingRows.length > 0) {
      await db.insert(schema.stockHolding).values(holdingRows).onConflictDoNothing();
    }

    const cashRows = investments.flatMap((inv) =>
      (inv.cashItems ?? []).map((c) => ({
        id: c.id,
        accountId: inv.id,
        label: c.label,
        amount: BigInt(c.amount),
      })),
    );
    if (cashRows.length > 0) {
      await db.insert(schema.cashItem).values(cashRows).onConflictDoNothing();
    }
  }

  const savings = fixture.savings ?? [];
  if (savings.length > 0) {
    await db
      .insert(schema.savingsAccount)
      .values(
        savings.map((s) => ({
          id: s.id,
          userId,
          accountName: s.accountName,
          accountType: s.accountType,
          currency: s.currency,
          balance: BigInt(s.balance),
          interestRate: s.interestRate ?? null,
          note: s.note ?? "",
          color: s.color,
          updatedAt: now,
        })),
      )
      .onConflictDoNothing();

    const savingsRecordRows = savings.flatMap((s) =>
      (s.records ?? [])
        .map((r) => {
          const date = parseDate(r.date);
          return date ? { accountId: s.id, date, balance: BigInt(r.balance) } : null;
        })
        .filter((r): r is NonNullable<typeof r> => r !== null),
    );
    if (savingsRecordRows.length > 0) {
      await db.insert(schema.savingsRecord).values(savingsRecordRows).onConflictDoNothing();
    }
  }

  const debts = fixture.debts ?? [];
  if (debts.length > 0) {
    await db
      .insert(schema.debt)
      .values(
        debts.map((d) => ({
          id: d.id,
          userId,
          loanName: d.loanName,
          loanType: d.loanType,
          lender: d.lender,
          amount: BigInt(d.amount),
          interestRate: d.interestRate,
          maturityDate: parseDate(d.maturityDate),
          monthlyPayment: BigInt(d.monthlyPayment),
          note: d.note ?? "",
          updatedAt: now,
        })),
      )
      .onConflictDoNothing();
  }

  const realAssets = fixture.realAssets ?? [];
  if (realAssets.length > 0) {
    await db
      .insert(schema.realAsset)
      .values(
        realAssets.map((a) => ({
          id: a.id,
          userId,
          assetName: a.assetName,
          assetType: a.assetType,
          currentValue: BigInt(a.currentValue),
          purchaseValue: BigInt(a.purchaseValue),
          purchaseDate: parseDate(a.purchaseDate),
          note: a.note ?? "",
          color: a.color,
          updatedAt: now,
        })),
      )
      .onConflictDoNothing();
  }

  const progressPoints = fixture.progressPoints ?? [];
  if (progressPoints.length > 0) {
    const rows = progressPoints
      .map((p) => {
        const date = parseDate(p.date);
        return date
          ? {
              userId,
              date,
              totalAssets: BigInt(p.totalAssets),
              netAssets: BigInt(p.netAssets),
              investments: BigInt(p.investments),
              savings: BigInt(p.savings),
              realAssets: BigInt(p.realAssets),
              loans: BigInt(p.loans),
            }
          : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (rows.length > 0) {
      await db.insert(schema.assetProgressPoint).values(rows).onConflictDoNothing();
    }
  }

  const orderRows: { domain: string; order: string[] }[] = [
    { domain: "investment-accounts", order: investments.map((i) => i.id) },
    { domain: "savings-accounts", order: savings.map((s) => s.id) },
    { domain: "debts", order: debts.map((d) => d.id) },
    { domain: "real-assets", order: realAssets.map((a) => a.id) },
  ].filter((r) => r.order.length > 0);
  if (orderRows.length > 0) {
    await db
      .insert(schema.userListOrder)
      .values(orderRows.map((r) => ({ userId, domain: r.domain, order: r.order })))
      .onConflictDoNothing();
  }

  console.log(
    `[seed] user-data: investments=${investments.length}, savings=${savings.length}, debts=${debts.length}, realAssets=${realAssets.length}, progressPoints=${progressPoints.length}, listOrders=${orderRows.length} in ${Date.now() - started}ms`,
  );
}

async function seedDevAuth(): Promise<void> {
  const now = new Date();
  const farFuture = new Date("2100-01-01T00:00:00Z");

  await db
    .insert(schema.user)
    .values({
      id: DEV_USER_ID,
      email: DEV_USER_EMAIL,
      name: DEV_USER_NAME,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  await db
    .insert(schema.session)
    .values({
      id: DEV_SESSION_ID,
      userId: DEV_USER_ID,
      token: DEV_SESSION_TOKEN,
      expiresAt: farFuture,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.session.id,
      set: { expiresAt: farFuture, updatedAt: now },
    });

  console.log(`[seed] dev auth ensured: user=${DEV_USER_EMAIL}, session=${DEV_SESSION_ID}`);
}

async function main(): Promise<void> {
  if (shouldSkip()) return;

  if (process.env.NODE_ENV === "development") {
    await seedDevAuth();
    await seedUserData(DEV_USER_ID);
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
