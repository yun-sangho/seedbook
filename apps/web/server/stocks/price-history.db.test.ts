import { randomUUID } from "node:crypto";
import { schema } from "@seedbook/database";
import { openTestDb } from "@web/test/db/test-db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDailyCloses } from "./price-history";

const { db, close } = openTestDb();

// StockPrice 는 공용 표라, 이 파일만 쓰는 시장 이름으로 넣고 끝에 지운다.
const MARKET = `TEST-${randomUUID().slice(0, 8)}`;

async function addPrice(ticker: string, date: string, closePrice: number) {
  const price = BigInt(closePrice);
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

beforeAll(async () => {
  await addPrice("A", "2026-11-18", 90);
  await addPrice("A", "2026-11-19", 100);
  await addPrice("A", "2026-11-23", 110);
  await addPrice("A", "2026-11-24", 120);
  await addPrice("A", "2026-11-25", 130);
  await addPrice("B", "2026-11-24", 50);
});

afterAll(async () => {
  await db.delete(schema.stockPrice).where(eq(schema.stockPrice.stockMarket, MARKET));
  await close();
});

describe("loadDailyCloses", () => {
  it("returns the closes in the range plus the last close before it, oldest first", async () => {
    const closes = await loadDailyCloses(
      db,
      [{ market: MARKET, ticker: "A" }],
      "2026-11-20",
      "2026-11-24"
    );

    expect(closes.get(`${MARKET}:A`)).toEqual([
      { date: "2026-11-19", close: 100 },
      { date: "2026-11-23", close: 110 },
      { date: "2026-11-24", close: 120 },
    ]);
  });

  it("loads several stocks at once and leaves out stocks without any close", async () => {
    const closes = await loadDailyCloses(
      db,
      [
        { market: MARKET, ticker: "B" },
        { market: MARKET, ticker: "NONE" },
      ],
      "2026-11-20",
      "2026-11-30"
    );

    expect([...closes.keys()]).toEqual([`${MARKET}:B`]);
    expect(closes.get(`${MARKET}:B`)).toEqual([{ date: "2026-11-24", close: 50 }]);
  });

  it("returns only the earlier close when the range has none", async () => {
    const closes = await loadDailyCloses(
      db,
      [{ market: MARKET, ticker: "A" }],
      "2026-11-28",
      "2026-11-30"
    );

    expect(closes.get(`${MARKET}:A`)).toEqual([{ date: "2026-11-25", close: 130 }]);
  });
});
