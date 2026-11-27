import { randomUUID } from "node:crypto";
import { growPortfolioPlants, schema } from "@seedbook/database";
import { openTestDb } from "@web/test/db/test-db";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

const { db, createTestUser, close } = openTestDb();
afterAll(close);

const DAY = "2026-11-27";
const NOW = new Date("2026-11-27T07:40:00.000Z");

async function createUser(storageMode: "cloud" | "local") {
  const userId = await createTestUser();
  await db.insert(schema.userPreference).values({ userId, storageMode });
  return userId;
}

async function createPortfolio(
  userId: string,
  plant: { goalAmount: number | null; growthStage?: number; goalHistory?: never[] | object[] }
) {
  const id = randomUUID();
  await db.insert(schema.portfolio).values({
    id,
    userId,
    name: "안정형",
    color: "#111",
    goalAmount: plant.goalAmount,
    growthStage: plant.growthStage ?? 0,
    goalHistory: (plant.goalHistory ?? []) as Array<{ amount: number; reachedAt: string }>,
  });
  return id;
}

/** 포트폴리오에 연결된 계좌와 그 날 평가 기록. */
async function addAccountValue(
  userId: string,
  portfolioId: string,
  totalValue: number,
  { date = DAY, deleted = false }: { date?: string; deleted?: boolean } = {}
) {
  const accountId = randomUUID();
  await db.insert(schema.investmentAccount).values({
    id: accountId,
    userId,
    accountName: "계좌",
    accountType: "일반",
    currency: "KRW",
    initialInvestment: 0n,
    currentValue: 0n,
    color: "#000000",
    portfolioId,
    deletedAt: deleted ? new Date() : null,
  });
  await db.insert(schema.investmentAccountSnapshot).values({
    accountId,
    userId,
    date,
    stockValue: BigInt(totalValue),
    cashValue: 0n,
    totalValue: BigInt(totalValue),
    holdingCount: 1,
    missingPriceCount: 0,
  });
}

async function portfolioRow(id: string) {
  const [row] = await db.select().from(schema.portfolio).where(eq(schema.portfolio.id, id));
  return row!;
}

describe("growPortfolioPlants", () => {
  it("grows a cloud user's plant when its linked accounts reach the goal that day", async () => {
    const userId = await createUser("cloud");
    const id = await createPortfolio(userId, { goalAmount: 10_000 });
    await addAccountValue(userId, id, 6_000);
    await addAccountValue(userId, id, 4_000);

    await growPortfolioPlants(db, DAY, NOW);

    expect(await portfolioRow(id)).toMatchObject({
      goalAmount: null,
      growthStage: 1,
      goalHistory: [{ amount: 10_000, reachedAt: NOW.toISOString() }],
      version: 2,
    });
  });

  it("leaves a plant below its goal", async () => {
    const userId = await createUser("cloud");
    const id = await createPortfolio(userId, { goalAmount: 10_000 });
    await addAccountValue(userId, id, 9_999);

    await growPortfolioPlants(db, DAY, NOW);

    expect(await portfolioRow(id)).toMatchObject({
      goalAmount: 10_000,
      growthStage: 0,
      version: 1,
    });
  });

  it("keeps a plant without a goal as it is", async () => {
    const userId = await createUser("cloud");
    const id = await createPortfolio(userId, { goalAmount: null });
    await addAccountValue(userId, id, 1_000_000);

    await growPortfolioPlants(db, DAY, NOW);

    expect((await portfolioRow(id)).growthStage).toBe(0);
  });

  it("does not grow past flowers and fruit", async () => {
    const userId = await createUser("cloud");
    const id = await createPortfolio(userId, { goalAmount: 100, growthStage: 4 });
    await addAccountValue(userId, id, 1_000);

    await growPortfolioPlants(db, DAY, NOW);

    expect((await portfolioRow(id)).growthStage).toBe(4);
  });

  it("appends to the reached goals", async () => {
    const userId = await createUser("cloud");
    const first = { amount: 1_000, reachedAt: "2026-11-01T07:40:00.000Z" };
    const id = await createPortfolio(userId, {
      goalAmount: 5_000,
      growthStage: 1,
      goalHistory: [first],
    });
    await addAccountValue(userId, id, 5_000);

    await growPortfolioPlants(db, DAY, NOW);

    expect((await portfolioRow(id)).goalHistory).toEqual([
      first,
      { amount: 5_000, reachedAt: NOW.toISOString() },
    ]);
  });

  it("ignores local-mode users, deleted accounts and other days", async () => {
    const local = await createUser("local");
    const localPortfolio = await createPortfolio(local, { goalAmount: 100 });
    await addAccountValue(local, localPortfolio, 1_000);
    const cloud = await createUser("cloud");
    const cloudPortfolio = await createPortfolio(cloud, { goalAmount: 100 });
    await addAccountValue(cloud, cloudPortfolio, 1_000, { deleted: true });
    await addAccountValue(cloud, cloudPortfolio, 1_000, { date: "2026-11-26" });

    await growPortfolioPlants(db, DAY, NOW);

    expect((await portfolioRow(localPortfolio)).growthStage).toBe(0);
    expect((await portfolioRow(cloudPortfolio)).growthStage).toBe(0);
  });
});
