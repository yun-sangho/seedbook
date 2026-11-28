import { randomUUID } from "node:crypto";
import { notifyReachedGoals, schema } from "@seedbook/database";
import { openTestDb } from "@web/test/db/test-db";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { registerPushDevice } from "./push-devices";
import { createTestSession, fakeSender, testToken } from "./push-test-fixtures";

const { db, createTestUser, close } = openTestDb();

// StockPrice 는 공용 표라 이 파일만 쓰는 시장 이름으로 넣고 끝에 지운다.
const MARKET = `TEST-${randomUUID().slice(0, 8)}`;
afterAll(async () => {
  await db.delete(schema.stockPrice).where(eq(schema.stockPrice.stockMarket, MARKET));
  await close();
});

const DAY = "2026-11-27";
/** 16:50 KST — 오후 수집 뒤. */
const AFTER_CLOSE = new Date("2026-11-27T07:50:00.000Z");
const TICKER = "000001";
const PRICE = 10_000;

await db.insert(schema.stockPrice).values({
  stockMarket: MARKET,
  stockTicker: TICKER,
  date: new Date(`${DAY}T00:00:00+09:00`),
  open: BigInt(PRICE),
  high: BigInt(PRICE),
  low: BigInt(PRICE),
  close: BigInt(PRICE),
  volume: 0n,
});

interface Setup {
  storageMode?: "cloud" | "local";
  kinds?: "goal"[];
  goalAmount?: number | null;
  stageGoals?: number[];
  growthStage?: number;
  /** 보유 수량 (× 10,000원). */
  quantity?: number;
  cash?: number;
  /** 목표 비중 (보유 종목 하나). */
  targetPercent?: number;
}

async function setup({
  storageMode = "cloud",
  kinds = ["goal"],
  goalAmount = 1_000_000,
  stageGoals = [],
  growthStage = 0,
  quantity = 100,
  cash = 0,
  targetPercent = 100,
}: Setup = {}) {
  const userId = await createTestUser();
  await db.insert(schema.userPreference).values({ userId, storageMode });
  const token = testToken();
  await registerPushDevice(
    db,
    { userId, sessionId: await createTestSession(db, userId) },
    { token, platform: "ios", appId: "ing.boogie.seedbook", environment: "production", kinds },
    AFTER_CLOSE
  );

  const portfolioId = randomUUID();
  await db.insert(schema.portfolio).values({
    id: portfolioId,
    userId,
    name: "연금",
    color: "#111",
    plantName: "몽글이",
    goalAmount,
    stageGoals,
    growthStage,
    goalHistory: Array.from({ length: growthStage }, () => ({ amount: 1, reachedAt: "" })),
    driftMode: "absolute",
    driftThresholdPercent: 5,
  });
  await db.insert(schema.portfolioAllocation).values({
    id: randomUUID(),
    portfolioId,
    userId,
    market: MARKET,
    ticker: TICKER,
    name: TICKER,
    currency: "KRW",
    targetPercent,
  });
  const accountId = randomUUID();
  await db.insert(schema.investmentAccount).values({
    id: accountId,
    userId,
    accountName: "계좌",
    accountType: "일반",
    currency: "KRW",
    initialInvestment: 0n,
    currentValue: 0n,
    color: "#000",
    portfolioId,
  });
  await db.insert(schema.stockHolding).values({
    id: randomUUID(),
    accountId,
    userId,
    market: MARKET,
    ticker: TICKER,
    name: TICKER,
    currency: "KRW",
    quantity,
  });
  if (cash !== 0) {
    await db
      .insert(schema.cashItem)
      .values({ id: randomUUID(), accountId, userId, label: "예수금", amount: BigInt(cash) });
  }
  return { userId, token, portfolioId };
}

async function portfolioRow(id: string) {
  const [row] = await db.select().from(schema.portfolio).where(eq(schema.portfolio.id, id));
  return row!;
}

describe("notifyReachedGoals", () => {
  it("notifies a cloud user whose plant reached the next goal, without growing it", async () => {
    const { token, portfolioId } = await setup({ goalAmount: 1_000_000, quantity: 100 });
    const before = await portfolioRow(portfolioId);
    const { sender, sent } = fakeSender();

    await notifyReachedGoals(db, DAY, sender, AFTER_CLOSE);

    expect(sent.filter((s) => s.target.token === token)).toEqual([
      {
        target: expect.objectContaining({ token, appId: "ing.boogie.seedbook" }),
        message: {
          title: "몽글이",
          body: "평가금액이 목표 100만원에 닿았어요. 정원에서 확인해 보세요.",
          data: { kind: "goal" },
        },
      },
    ]);
    expect(await portfolioRow(portfolioId)).toEqual(before);
  });

  it("uses the stage goal when the current goal is empty", async () => {
    const { token } = await setup({
      goalAmount: null,
      stageGoals: [100_000, 900_000, 2_000_000, 3_000_000, 4_000_000],
      growthStage: 1,
    });
    const { sender, sent } = fakeSender();
    await notifyReachedGoals(db, DAY, sender, AFTER_CLOSE);
    expect(sent.find((s) => s.target.token === token)?.message.body).toContain("90만원");
  });

  it("does not notify below the goal", async () => {
    const { token } = await setup({ goalAmount: 1_000_001 });
    const { sender, sent } = fakeSender();
    await notifyReachedGoals(db, DAY, sender, AFTER_CLOSE);
    expect(sent.some((s) => s.target.token === token)).toBe(false);
  });

  it("does not notify while the allocation is off its target (the app would not grow it)", async () => {
    // 종목 100% 목표인데 예수금이 절반 — 이격 초과.
    const { token } = await setup({ goalAmount: 1_000_000, cash: 1_000_000 });
    const { sender, sent } = fakeSender();
    await notifyReachedGoals(db, DAY, sender, AFTER_CLOSE);
    expect(sent.some((s) => s.target.token === token)).toBe(false);
  });

  it("does not notify local-mode users or devices with goal notifications off", async () => {
    const local = await setup({ storageMode: "local" });
    const off = await setup({ kinds: [] });
    const { sender, sent } = fakeSender();
    await notifyReachedGoals(db, DAY, sender, AFTER_CLOSE);
    expect(sent.some((s) => [local.token, off.token].includes(s.target.token))).toBe(false);
  });

  it("notifies the same stage only once", async () => {
    const { token } = await setup();
    const first = fakeSender();
    await notifyReachedGoals(db, DAY, first.sender, AFTER_CLOSE);
    const next = fakeSender();
    await notifyReachedGoals(db, "2026-11-28", next.sender, AFTER_CLOSE);
    expect(first.sent.filter((s) => s.target.token === token)).toHaveLength(1);
    expect(next.sent.some((s) => s.target.token === token)).toBe(false);
  });

  it("sends nothing in quiet hours (21~08 KST)", async () => {
    const { token } = await setup();
    const { sender, sent } = fakeSender();
    const result = await notifyReachedGoals(db, DAY, sender, new Date("2026-11-27T13:00:00Z"));
    expect(result.quiet).toBe(true);
    expect(sent.some((s) => s.target.token === token)).toBe(false);
  });

  it("removes devices APNs reports as unregistered", async () => {
    const { token } = await setup();
    const { sender } = fakeSender([token]);
    await notifyReachedGoals(db, DAY, sender, AFTER_CLOSE);
    const rows = await db
      .select()
      .from(schema.pushDevice)
      .where(eq(schema.pushDevice.token, token));
    expect(rows).toEqual([]);
  });
});
