import { randomUUID } from "node:crypto";
import { backfillUserSyncV2, reserveChangeSeqs, schema } from "@seedbook/database";
import { accountRecord, deriveRecordId, rebalancingTask } from "@seedbook/domain";
import { openTestDb } from "@web/test/db/test-db";
import { asc, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { syncV2Keys } from "../../../../packages/database/scripts/sync-v2-keys";

const { db, createTestUser, close } = openTestDb();
afterAll(close);

const T1 = new Date("2026-11-01T00:00:00Z");
const T2 = new Date("2026-11-02T00:00:00Z");
const T3 = new Date("2026-11-03T00:00:00Z");

const backfill = (userId: string) =>
  db.transaction((tx) => backfillUserSyncV2(tx, userId, syncV2Keys));

/** v1 엔드포인트가 쓰는 모양 그대로 (새 열은 넣지 않는다). */
async function insertAccount(userId: string, updatedAt: Date, createdAt = updatedAt) {
  const id = randomUUID();
  await db.insert(schema.investmentAccount).values({
    id,
    userId,
    accountName: `계좌 ${id.slice(0, 4)}`,
    accountType: "일반",
    currency: "KRW",
    initialInvestment: 0n,
    currentValue: 0n,
    color: "#000",
    createdAt,
    updatedAt,
  });
  return id;
}

async function insertHoldings(accountId: string, names: string[]) {
  const ids = names.map(() => randomUUID());
  await db.insert(schema.stockHolding).values(
    names.map((name, i) => ({
      id: ids[i] as string,
      accountId,
      market: "KR",
      ticker: name,
      name,
      currency: "KRW",
      quantity: 1,
    }))
  );
  return ids;
}

function task(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    market: "KR",
    ticker: id,
    name: id,
    action: "매수",
    amount: 10000,
    price: 5000,
    quantity: 2,
    priceAsOf: "2026-11-01T06:30:00.000Z",
    priceKind: "close",
    executedQuantity: null,
    executedPrice: null,
    orderedQuantity: null,
    orderedPrice: null,
    filledQuantity: null,
    filledAmount: null,
    done: false,
    ...overrides,
  };
}

async function insertRebalancing(
  userId: string,
  tasks: unknown[],
  options: { updatedAt?: Date; deletedAt?: Date } = {}
) {
  const id = randomUUID();
  await db.insert(schema.rebalancing).values({
    id,
    userId,
    accountId: "account",
    accountName: "계좌",
    portfolioId: "portfolio",
    portfolioName: "포트폴리오",
    cashDelta: 0n,
    tasks,
    startedAt: T1,
    updatedAt: options.updatedAt ?? T1,
    deletedAt: options.deletedAt ?? null,
  });
  return id;
}

const tasksOf = (rebalancingId: string) =>
  db
    .select()
    .from(schema.rebalancingTask)
    .where(eq(schema.rebalancingTask.rebalancingId, rebalancingId))
    .orderBy(asc(schema.rebalancingTask.sortKey));

/** 사용자의 동기화 행 전부 (테이블·키·changeSeq). */
async function changeSeqs(userId: string) {
  const [accounts, holdings, cash, records, portfolios, allocations, sessions, tasks, prefs] =
    await Promise.all([
      db.select().from(schema.investmentAccount).where(eq(schema.investmentAccount.userId, userId)),
      db.select().from(schema.stockHolding).where(eq(schema.stockHolding.userId, userId)),
      db.select().from(schema.cashItem).where(eq(schema.cashItem.userId, userId)),
      db.select().from(schema.investmentRecord).where(eq(schema.investmentRecord.userId, userId)),
      db.select().from(schema.portfolio).where(eq(schema.portfolio.userId, userId)),
      db
        .select()
        .from(schema.portfolioAllocation)
        .where(eq(schema.portfolioAllocation.userId, userId)),
      db.select().from(schema.rebalancing).where(eq(schema.rebalancing.userId, userId)),
      db.select().from(schema.rebalancingTask).where(eq(schema.rebalancingTask.userId, userId)),
      db.select().from(schema.userPreference).where(eq(schema.userPreference.userId, userId)),
    ]);
  return [
    ...accounts.map((r) => ({ key: `account:${r.id}`, seq: r.changeSeq })),
    ...holdings.map((r) => ({ key: `holding:${r.id}`, seq: r.changeSeq })),
    ...cash.map((r) => ({ key: `cash:${r.id}`, seq: r.changeSeq })),
    ...records.map((r) => ({ key: `accountRecord:${r.id}`, seq: r.changeSeq })),
    ...portfolios.map((r) => ({ key: `portfolio:${r.id}`, seq: r.changeSeq })),
    ...allocations.map((r) => ({ key: `allocation:${r.id}`, seq: r.changeSeq })),
    ...sessions.map((r) => ({ key: `rebalancing:${r.id}`, seq: r.changeSeq })),
    ...tasks.map((r) => ({ key: `rebalancingTask:${r.id}`, seq: r.changeSeq })),
    ...prefs.map((r) => ({ key: `settings:${r.userId}`, seq: r.changeSeq })),
  ].sort((a, b) => a.seq - b.seq);
}

async function syncStateSeq(userId: string) {
  const [row] = await db
    .select()
    .from(schema.userSyncState)
    .where(eq(schema.userSyncState.userId, userId));
  return row?.seq ?? null;
}

describe("reserveChangeSeqs", () => {
  it("hands out consecutive numbers per user, starting at 1", async () => {
    const userId = await createTestUser();

    const first = await db.transaction((tx) => reserveChangeSeqs(tx, userId, 3));
    const second = await db.transaction((tx) => reserveChangeSeqs(tx, userId, 2));

    expect([first, second]).toEqual([
      { first: 1, last: 3 },
      { first: 4, last: 5 },
    ]);
  });

  it("counts each user separately", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    await db.transaction((tx) => reserveChangeSeqs(tx, a, 5));

    const result = await db.transaction((tx) => reserveChangeSeqs(tx, b, 1));

    expect(result).toEqual({ first: 1, last: 1 });
  });
});

describe("backfillUserSyncV2", () => {
  it("copies the parent's userId onto child rows", async () => {
    const userId = await createTestUser();
    const accountId = await insertAccount(userId, T1);
    const [holdingId] = await insertHoldings(accountId, ["삼성전자"]);
    await db
      .insert(schema.cashItem)
      .values({ id: randomUUID(), accountId, label: "예수금", amount: 1n });

    await backfill(userId);

    const [holding] = await db
      .select()
      .from(schema.stockHolding)
      .where(eq(schema.stockHolding.id, holdingId as string));
    const [cash] = await db
      .select()
      .from(schema.cashItem)
      .where(eq(schema.cashItem.accountId, accountId));
    expect([holding?.userId, cash?.userId]).toEqual([userId, userId]);
  });

  it("keys account records by uuidv5(accountId, date)", async () => {
    const userId = await createTestUser();
    const accountId = await insertAccount(userId, T1);
    await db.insert(schema.investmentRecord).values({
      accountId,
      date: new Date("2026-11-27T00:00:00Z"),
      initialInvestment: 100n,
      currentValue: 110n,
    });

    await backfill(userId);

    const [record] = await db
      .select()
      .from(schema.investmentRecord)
      .where(eq(schema.investmentRecord.accountId, accountId));
    expect(record?.id).toBe(
      deriveRecordId(accountRecord, { parentId: accountId, fields: { date: "2026-11-27" } })
    );
  });

  it("orders root records by the saved list order, then by creation", async () => {
    const userId = await createTestUser();
    const first = await insertAccount(userId, T1, T1);
    const second = await insertAccount(userId, T1, T2);
    const unlisted = await insertAccount(userId, T1, T3);
    await db
      .insert(schema.userListOrder)
      .values({ userId, domain: "investment-accounts", order: [second, first] });

    await backfill(userId);

    const rows = await db
      .select({ id: schema.investmentAccount.id })
      .from(schema.investmentAccount)
      .where(eq(schema.investmentAccount.userId, userId))
      .orderBy(asc(schema.investmentAccount.sortKey));
    expect(rows.map((r) => r.id)).toEqual([second, first, unlisted]);
  });

  it("orders child records in the order they were saved", async () => {
    const userId = await createTestUser();
    const accountId = await insertAccount(userId, T1);
    const ids = await insertHoldings(accountId, ["다", "가", "나"]);

    await backfill(userId);

    const rows = await db
      .select({ id: schema.stockHolding.id })
      .from(schema.stockHolding)
      .where(eq(schema.stockHolding.accountId, accountId))
      .orderBy(asc(schema.stockHolding.sortKey));
    expect(rows.map((r) => r.id)).toEqual(ids);
  });

  it("expands rebalancing tasks into rebalancing_task rows in jsonb order", async () => {
    const userId = await createTestUser();
    const rebalancingId = await insertRebalancing(userId, [
      task("alloc-b", { action: "매도", done: true, executedQuantity: 3 }),
      task("alloc-a", { price: null, quantity: null, priceAsOf: null, priceKind: null }),
    ]);

    await backfill(userId);

    const rows = await tasksOf(rebalancingId);
    expect(
      rows.map((r) => ({ id: r.id, allocationId: r.allocationId, action: r.action, done: r.done }))
    ).toEqual([
      {
        id: deriveRecordId(rebalancingTask, {
          parentId: rebalancingId,
          fields: { allocationId: "alloc-b" },
        }),
        allocationId: "alloc-b",
        action: "매도",
        done: true,
      },
      {
        id: deriveRecordId(rebalancingTask, {
          parentId: rebalancingId,
          fields: { allocationId: "alloc-a" },
        }),
        allocationId: "alloc-a",
        action: "매수",
        done: false,
      },
    ]);
    expect(rows[0]).toMatchObject({
      userId,
      executedQuantity: 3,
      priceAsOf: new Date("2026-11-01T06:30:00.000Z"),
      priceKind: "close",
      deletedAt: null,
    });
    expect(rows[1]).toMatchObject({
      price: null,
      quantity: null,
      priceAsOf: null,
      priceKind: null,
    });
  });

  it("gives the same allocation different task ids in two rebalancings", async () => {
    const userId = await createTestUser();
    const a = await insertRebalancing(userId, [task("alloc-1")]);
    const b = await insertRebalancing(userId, [task("alloc-1")]);

    await backfill(userId);

    const [[taskA], [taskB]] = await Promise.all([tasksOf(a), tasksOf(b)]);
    expect(taskA?.id).toBeDefined();
    expect(taskA?.id).not.toBe(taskB?.id);
  });

  it("skips malformed tasks and repeated allocations", async () => {
    const userId = await createTestUser();
    const rebalancingId = await insertRebalancing(userId, [
      task("alloc-1"),
      task("alloc-1", { amount: 1 }),
      { id: "broken" },
    ]);

    const summary = await backfill(userId);

    expect((await tasksOf(rebalancingId)).map((r) => [r.allocationId, r.amount])).toEqual([
      ["alloc-1", 10000],
    ]);
    expect(summary.tasksSkipped).toBe(2);
  });

  it("tombstones the children of a deleted parent", async () => {
    const userId = await createTestUser();
    const accountId = await insertAccount(userId, T1);
    await insertHoldings(accountId, ["삼성전자"]);
    await db
      .update(schema.investmentAccount)
      .set({ deletedAt: T2 })
      .where(eq(schema.investmentAccount.id, accountId));
    const rebalancingId = await insertRebalancing(userId, [task("alloc-1")], { deletedAt: T2 });

    await backfill(userId);

    const [holding] = await db
      .select()
      .from(schema.stockHolding)
      .where(eq(schema.stockHolding.accountId, accountId));
    const [taskRow] = await tasksOf(rebalancingId);
    expect([holding?.deletedAt, taskRow?.deletedAt]).toEqual([T2, T2]);
  });

  it("numbers every record once in updatedAt order, parents before children", async () => {
    const userId = await createTestUser();
    const later = await insertAccount(userId, T2);
    const earlier = await insertAccount(userId, T1);
    const [holding] = await insertHoldings(earlier, ["삼성전자"]);
    const rebalancingId = await insertRebalancing(userId, [task("alloc-1")], { updatedAt: T3 });
    await db.insert(schema.userPreference).values({ userId });

    await backfill(userId);

    const taskId = deriveRecordId(rebalancingTask, {
      parentId: rebalancingId,
      fields: { allocationId: "alloc-1" },
    });
    const seqs = await changeSeqs(userId);
    // 설정의 updatedAt 은 방금(마이그레이션 기본값) 이라 마지막.
    expect(seqs).toEqual([
      { key: `account:${earlier}`, seq: 1 },
      { key: `holding:${holding}`, seq: 2 },
      { key: `account:${later}`, seq: 3 },
      { key: `rebalancing:${rebalancingId}`, seq: 4 },
      { key: `rebalancingTask:${taskId}`, seq: 5 },
      { key: `settings:${userId}`, seq: 6 },
    ]);
    expect(await syncStateSeq(userId)).toBe(6);
  });

  it("changes nothing when run again", async () => {
    const userId = await createTestUser();
    const accountId = await insertAccount(userId, T1);
    await insertHoldings(accountId, ["가", "나"]);
    await db.insert(schema.investmentRecord).values({
      accountId,
      date: new Date("2026-11-27T00:00:00Z"),
      initialInvestment: 1n,
      currentValue: 1n,
    });
    await insertRebalancing(userId, [task("alloc-1"), task("alloc-2")]);
    await backfill(userId);
    const before = {
      seqs: await changeSeqs(userId),
      holdings: await db
        .select()
        .from(schema.stockHolding)
        .where(eq(schema.stockHolding.userId, userId)),
      tasks: await db
        .select()
        .from(schema.rebalancingTask)
        .where(eq(schema.rebalancingTask.userId, userId)),
      accounts: await db
        .select()
        .from(schema.investmentAccount)
        .where(eq(schema.investmentAccount.userId, userId)),
    };

    const summary = await backfill(userId);

    expect(Object.values(summary).every((n) => n === 0)).toBe(true);
    expect({
      seqs: await changeSeqs(userId),
      holdings: await db
        .select()
        .from(schema.stockHolding)
        .where(eq(schema.stockHolding.userId, userId)),
      tasks: await db
        .select()
        .from(schema.rebalancingTask)
        .where(eq(schema.rebalancingTask.userId, userId)),
      accounts: await db
        .select()
        .from(schema.investmentAccount)
        .where(eq(schema.investmentAccount.userId, userId)),
    }).toEqual(before);
    expect(await syncStateSeq(userId)).toBe(before.seqs.length);
  });

  it("does not touch the v1 pull cursor (root updatedAt)", async () => {
    const userId = await createTestUser();
    const accountId = await insertAccount(userId, T1);

    await backfill(userId);

    const [account] = await db
      .select()
      .from(schema.investmentAccount)
      .where(eq(schema.investmentAccount.id, accountId));
    expect(account?.updatedAt).toEqual(T1);
  });

  it("fills only what v1 writes left empty when run again", async () => {
    const userId = await createTestUser();
    const accountId = await insertAccount(userId, T1);
    await insertHoldings(accountId, ["가"]);
    await backfill(userId);
    // v1 저장: 하위 행을 통째로 지우고 새 열 없이 다시 넣는다.
    await db.delete(schema.stockHolding).where(eq(schema.stockHolding.accountId, accountId));
    const newIds = await insertHoldings(accountId, ["나", "가"]);

    await backfill(userId);

    const rows = await db
      .select()
      .from(schema.stockHolding)
      .where(eq(schema.stockHolding.accountId, accountId))
      .orderBy(asc(schema.stockHolding.sortKey));
    expect(rows.map((r) => ({ id: r.id, userId: r.userId, seq: r.changeSeq }))).toEqual([
      { id: newIds[0], userId, seq: 3 },
      { id: newIds[1], userId, seq: 4 },
    ]);
    expect(await syncStateSeq(userId)).toBe(4);
  });

  it("follows task changes made through v1 when run again", async () => {
    const userId = await createTestUser();
    const rebalancingId = await insertRebalancing(userId, [task("alloc-1"), task("alloc-2")]);
    await backfill(userId);
    await db
      .update(schema.rebalancing)
      .set({ tasks: [task("alloc-1", { done: true })], updatedAt: T2 })
      .where(eq(schema.rebalancing.id, rebalancingId));

    const summary = await backfill(userId);

    const rows = await tasksOf(rebalancingId);
    expect(
      rows.map((r) => ({
        allocationId: r.allocationId,
        done: r.done,
        version: r.version,
        deleted: r.deletedAt !== null,
        seq: r.changeSeq,
      }))
    ).toEqual([
      { allocationId: "alloc-1", done: true, version: 2, deleted: false, seq: 4 },
      { allocationId: "alloc-2", done: false, version: 2, deleted: true, seq: 5 },
    ]);
    expect(summary).toMatchObject({ tasksUpdated: 1, tasksTombstoned: 1, changeSeqs: 2 });
  });
});
