import { randomUUID } from "node:crypto";
import { recordAccountSnapshots, schema } from "@seedbook/database";
import { openTestDb } from "@web/test/db/test-db";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

const { db, createTestUser, close } = openTestDb();

// StockPrice 는 사용자에 묶이지 않은 공용 표라, 이 파일만 쓰는 시장 이름으로 넣고 끝에 지운다.
const MARKET = `TEST-${randomUUID().slice(0, 8)}`;
afterAll(async () => {
  await db.delete(schema.stockPrice).where(eq(schema.stockPrice.stockMarket, MARKET));
  await close();
});

const DAY = "2026-11-27";

async function addPrice(ticker: string, date: string, close: number) {
  const price = BigInt(close);
  await db.insert(schema.stockPrice).values({
    stockMarket: MARKET,
    stockTicker: ticker,
    date: new Date(`${date}T00:00:00+09:00`),
    open: price,
    high: price,
    low: price,
    close: price,
    volume: 0n,
  });
}

async function createUser(storageMode: "cloud" | "local" | null) {
  const userId = await createTestUser();
  if (storageMode) {
    await db.insert(schema.userPreference).values({ userId, storageMode });
  }
  return userId;
}

async function createAccount(
  userId: string,
  {
    holdings = [],
    cash = [],
    deleted = false,
  }: { holdings?: Array<[ticker: string, quantity: number]>; cash?: number[]; deleted?: boolean }
) {
  const id = randomUUID();
  await db.insert(schema.investmentAccount).values({
    id,
    userId,
    accountName: "계좌",
    accountType: "일반",
    currency: "KRW",
    initialInvestment: 0n,
    currentValue: 0n,
    color: "#000000",
    deletedAt: deleted ? new Date() : null,
  });
  for (const [ticker, quantity] of holdings) {
    await db.insert(schema.stockHolding).values({
      id: randomUUID(),
      accountId: id,
      market: MARKET,
      ticker,
      name: ticker,
      currency: "KRW",
      quantity,
    });
  }
  for (const amount of cash) {
    await db
      .insert(schema.cashItem)
      .values({ id: randomUUID(), accountId: id, label: "예수금", amount: BigInt(amount) });
  }
  return id;
}

function snapshotsOf(accountIds: string[]) {
  const t = schema.investmentAccountSnapshot;
  return db.select().from(t).where(inArray(t.accountId, accountIds));
}

async function snapshotOf(accountId: string, date = DAY) {
  const t = schema.investmentAccountSnapshot;
  const [row] = await db
    .select()
    .from(t)
    .where(and(eq(t.accountId, accountId), eq(t.date, date)));
  return row;
}

describe("recordAccountSnapshots", () => {
  it("records each live account of a cloud user with its holdings at that day's close", async () => {
    await addPrice("A1", DAY, 1_000);
    const userId = await createUser("cloud");
    const accountId = await createAccount(userId, { holdings: [["A1", 3]], cash: [500, -200] });

    await recordAccountSnapshots(db, DAY);

    expect(await snapshotOf(accountId)).toMatchObject({
      userId,
      stockValue: 3_000n,
      cashValue: 300n,
      totalValue: 3_300n,
      holdingCount: 1,
      missingPriceCount: 0,
      oldestPriceDate: DAY,
    });
  });

  it("uses the latest earlier close when the day has none, never a later one", async () => {
    await addPrice("B1", "2026-11-25", 900);
    await addPrice("B1", "2026-11-26", 950);
    await addPrice("B1", "2026-11-30", 2_000);
    const userId = await createUser("cloud");
    const accountId = await createAccount(userId, { holdings: [["B1", 2]] });

    await recordAccountSnapshots(db, DAY);

    expect(await snapshotOf(accountId)).toMatchObject({
      stockValue: 1_900n,
      oldestPriceDate: "2026-11-26",
    });
  });

  it("counts a holding with no close at all as missing and leaves it out of the value", async () => {
    const userId = await createUser("cloud");
    const accountId = await createAccount(userId, { holdings: [["NONE", 5]], cash: [100] });

    await recordAccountSnapshots(db, DAY);

    expect(await snapshotOf(accountId)).toMatchObject({
      stockValue: 0n,
      totalValue: 100n,
      holdingCount: 1,
      missingPriceCount: 1,
      oldestPriceDate: null,
    });
  });

  it("records an empty account at 0", async () => {
    const userId = await createUser("cloud");
    const accountId = await createAccount(userId, {});

    await recordAccountSnapshots(db, DAY);

    expect(await snapshotOf(accountId)).toMatchObject({ totalValue: 0n, holdingCount: 0 });
  });

  it("skips deleted (tombstoned) accounts", async () => {
    const userId = await createUser("cloud");
    const deletedId = await createAccount(userId, { cash: [100], deleted: true });

    await recordAccountSnapshots(db, DAY);

    expect(await snapshotsOf([deletedId])).toEqual([]);
  });

  it("skips local-mode users and users who never chose a mode, whose server rows may be stale", async () => {
    const localUser = await createUser("local");
    const unchosenUser = await createUser(null);
    const localAccount = await createAccount(localUser, { cash: [100] });
    const unchosenAccount = await createAccount(unchosenUser, { cash: [100] });

    await recordAccountSnapshots(db, DAY);

    expect(await snapshotsOf([localAccount, unchosenAccount])).toEqual([]);
  });

  it("overwrites the same day's row when run again (idempotent)", async () => {
    await addPrice("C1", DAY, 100);
    const userId = await createUser("cloud");
    const accountId = await createAccount(userId, { holdings: [["C1", 1]] });
    await recordAccountSnapshots(db, DAY);

    await db
      .update(schema.stockPrice)
      .set({ close: 120n })
      .where(
        and(eq(schema.stockPrice.stockMarket, MARKET), eq(schema.stockPrice.stockTicker, "C1"))
      );
    await recordAccountSnapshots(db, DAY);

    expect(await snapshotsOf([accountId])).toHaveLength(1);
    expect((await snapshotOf(accountId))?.totalValue).toBe(120n);
  });

  it("keeps earlier days when recording a new day", async () => {
    const userId = await createUser("cloud");
    const accountId = await createAccount(userId, { cash: [100] });

    await recordAccountSnapshots(db, "2026-11-26");
    await recordAccountSnapshots(db, DAY);

    expect((await snapshotsOf([accountId])).map((r) => r.date).sort()).toEqual(["2026-11-26", DAY]);
  });

  it("covers every account when they span several batches", async () => {
    await addPrice("D1", DAY, 10);
    const userId = await createUser("cloud");
    const accountIds: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      accountIds.push(await createAccount(userId, { holdings: [["D1", i + 1]] }));
    }

    await recordAccountSnapshots(db, DAY, { batchSize: 2 });

    const rows = await snapshotsOf(accountIds);
    expect(rows).toHaveLength(5);
    expect(rows.reduce((sum, r) => sum + r.totalValue, 0n)).toBe(150n);
  });
});
