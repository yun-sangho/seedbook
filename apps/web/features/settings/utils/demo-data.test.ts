import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseBackup } from "./data-backup";

/**
 * 테스트 시나리오 픽스처 (`packages/database/seed-data/user-data.json`) 의 정합성.
 * dev DB 시드·리셋과 관리 화면 "데모 데이터" (`public/seed-data/user-data.json`) 가 같은 파일을 쓴다.
 */
const SEED_DIR = resolve(__dirname, "../../../../../packages/database/seed-data");
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8")) as unknown;

const seedFixture = readJson(resolve(SEED_DIR, "user-data.json"));
const demoFixture = readJson(resolve(__dirname, "../../../public/seed-data/user-data.json"));
const parsed = parseBackup(seedFixture);
const data = parsed.ok ? parsed.data : {};
const investments = data.investments ?? [];
const portfolios = data.portfolios ?? [];

describe("seed scenario fixture", () => {
  it("is the same file the admin page loads as demo data", () => {
    expect(demoFixture).toEqual(seedFixture);
  });

  it("is a backup the admin page can import, with accounts and portfolios", () => {
    expect(parsed.ok).toBe(true);
    expect(investments.length).toBeGreaterThan(0);
    expect(portfolios.length).toBeGreaterThan(0);
  });

  it("links each account to at most one portfolio, and only to accounts that exist", () => {
    const accountIds = new Set(investments.map((i) => i.id));
    const linked = portfolios.flatMap((p) => p.accountIds);

    expect(linked.filter((id) => !accountIds.has(id))).toEqual([]);
    expect(new Set(linked).size).toBe(linked.length);
  });

  it("gives every portfolio target weights that add up to 100%", () => {
    for (const p of portfolios) {
      const total = p.allocations.reduce((sum, a) => sum + a.targetPercent, 0);
      expect(total, p.name).toBeCloseTo(100);
    }
  });

  it("only uses stocks that the stock seed has a price for", () => {
    const stocks = readJson(resolve(SEED_DIR, "stocks.json")) as { ticker: string }[];
    const prices = readJson(resolve(SEED_DIR, "stock-prices.json")) as { stockTicker: string }[];
    const known = new Set(stocks.map((s) => s.ticker));
    const priced = new Set(prices.map((p) => p.stockTicker));
    const used = [
      ...investments.flatMap((i) => i.holdings.map((h) => h.ticker)),
      ...portfolios.flatMap((p) => p.allocations.map((a) => a.ticker)),
    ];

    expect(used.filter((t) => !known.has(t) || !priced.has(t))).toEqual([]);
  });
});
