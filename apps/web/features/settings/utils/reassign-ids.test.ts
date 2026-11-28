import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RebalancingSession } from "@web/features/rebalancing/types/types";
import { describe, expect, it } from "vitest";
import { type BackupSections, parseBackup } from "./data-backup";
import { reassignIds } from "./reassign-ids";

/** 테스트 시나리오 픽스처 (`packages/database/seed-data/user-data.json`). */
const fixture = JSON.parse(
  readFileSync(
    resolve(__dirname, "../../../../../packages/database/seed-data/user-data.json"),
    "utf8"
  )
) as unknown;
const parsed = parseBackup(fixture);
const data = parsed.ok ? parsed.data : {};
const portfolios = data.portfolios ?? [];

describe("reassignIds", () => {
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
    const result = (await reassignIds(data, "user-a")).data;

    const fixtureIds = new Set(rowIds(data));
    expect(rowIds(result).filter((id) => fixtureIds.has(id))).toEqual([]);
  });

  it("shares no row id between two users", async () => {
    const a = rowIds((await reassignIds(data, "user-a")).data);
    const b = rowIds((await reassignIds(data, "user-b")).data);

    expect(a.filter((id) => b.includes(id))).toEqual([]);
  });

  it("gives the same user the same ids every time, so loading again does not duplicate", async () => {
    const first = (await reassignIds(data, "user-a")).data;
    const second = (await reassignIds(data, "user-a")).data;

    expect(second).toEqual(first);
  });

  it("gives every row its own valid UUID", async () => {
    const ids = rowIds((await reassignIds(data, "user-a")).data);

    expect(new Set(ids).size).toBe(rowIds(data).length);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  it("keeps portfolios linked to the same accounts", async () => {
    const result = (await reassignIds(data, "user-a")).data;

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

    const result = (await reassignIds({ ...data, rebalancingSessions: [session] }, "user-a")).data;

    const newPortfolio = result.portfolios![0]!;
    const newSession = result.rebalancingSessions![0]!;
    expect(newSession.id).not.toBe(session.id);
    expect(newSession.accountId).toBe(newPortfolio.accountIds[0]);
    expect(newSession.portfolioId).toBe(newPortfolio.id);
    expect(newSession.tasks[0]!.id).toBe(newPortfolio.allocations[0]!.id);
  });

  it("leaves sections that are not in the file out", async () => {
    expect((await reassignIds({ investments: [] }, "user-a")).data).toEqual({ investments: [] });
  });

  it("does not change the data it was given", async () => {
    const before = structuredClone(data);

    await reassignIds(data, "user-a");

    expect(data).toEqual(before);
  });
});
