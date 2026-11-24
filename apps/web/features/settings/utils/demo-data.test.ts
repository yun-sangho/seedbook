import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RebalancingSession } from "@web/features/rebalancing/types/types";
import { describe, expect, it } from "vitest";
import { type BackupSections, parseBackup } from "./data-backup";
import { assignDemoDataIds } from "./demo-data";

/**
 * 테스트 시나리오 픽스처 (`packages/database/seed-data/user-data.json`) 의 정합성.
 * dev DB 시드·리셋과 설정 화면 "데모 데이터" (`public/seed-data/user-data.json`) 가 같은 파일을 쓴다.
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

describe("assignDemoDataIds", () => {
  /** 계좌·보유 종목·예수금·포트폴리오·비중 id — 모두 서버 테이블의 기본 키다. */
  const rowIds = (d: Partial<BackupSections>) => [
    ...(d.investments ?? []).flatMap((i) => [
      i.id,
      ...i.holdings.map((h) => h.id),
      ...i.cashItems.map((c) => c.id),
    ]),
    ...(d.portfolios ?? []).flatMap((p) => [p.id, ...p.allocations.map((a) => a.id)]),
    ...(d.rebalancingSessions ?? []).map((s) => s.id),
  ];

  it("shares no row id with the fixture", async () => {
    const result = await assignDemoDataIds(data, "user-a");

    const fixtureIds = new Set(rowIds(data));
    expect(rowIds(result).filter((id) => fixtureIds.has(id))).toEqual([]);
  });

  it("shares no row id between two users", async () => {
    const a = rowIds(await assignDemoDataIds(data, "user-a"));
    const b = rowIds(await assignDemoDataIds(data, "user-b"));

    expect(a.filter((id) => b.includes(id))).toEqual([]);
  });

  it("gives the same user the same ids every time, so loading again does not duplicate", async () => {
    const first = await assignDemoDataIds(data, "user-a");
    const second = await assignDemoDataIds(data, "user-a");

    expect(second).toEqual(first);
  });

  it("gives every row its own valid UUID", async () => {
    const ids = rowIds(await assignDemoDataIds(data, "user-a"));

    expect(new Set(ids).size).toBe(rowIds(data).length);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  it("keeps portfolios linked to the same accounts", async () => {
    const result = await assignDemoDataIds(data, "user-a");

    const links = (d: Partial<BackupSections>) =>
      (d.portfolios ?? []).map((p) =>
        p.accountIds.map((id) => d.investments?.find((i) => i.id === id)?.accountName)
      );
    expect(links(result)).toEqual(links(data));
  });

  it("keeps rebalancing sessions pointing at their account, portfolio and allocations", async () => {
    const portfolio = portfolios[0]!;
    const session = {
      id: "5eed0f00-0000-4000-8000-000000000001",
      accountId: portfolio.accountIds[0]!,
      portfolioId: portfolio.id,
      tasks: [{ id: portfolio.allocations[0]!.id }],
    } as RebalancingSession;

    const result = await assignDemoDataIds({ ...data, rebalancingSessions: [session] }, "user-a");

    const newPortfolio = result.portfolios![0]!;
    const newSession = result.rebalancingSessions![0]!;
    expect(newSession.id).not.toBe(session.id);
    expect(newSession.accountId).toBe(newPortfolio.accountIds[0]);
    expect(newSession.portfolioId).toBe(newPortfolio.id);
    expect(newSession.tasks[0]!.id).toBe(newPortfolio.allocations[0]!.id);
  });

  it("leaves sections that are not in the file out", async () => {
    expect(await assignDemoDataIds({ investments: [] }, "user-a")).toEqual({ investments: [] });
  });

  it("does not change the data it was given", async () => {
    const before = structuredClone(data);

    await assignDemoDataIds(data, "user-a");

    expect(data).toEqual(before);
  });
});
