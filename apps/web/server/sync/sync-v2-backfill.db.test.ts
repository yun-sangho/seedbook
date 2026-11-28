import { randomUUID } from "node:crypto";
import { backfillUserSyncV2, reserveChangeSeqs, schema } from "@seedbook/database";
import {
  accountRecord,
  deriveRecordId,
  rebalancingTask,
  SCHEMA_VERSION,
  type SyncOp,
  type SyncOpResult,
} from "@seedbook/domain";
import { openTestDb } from "@web/test/db/test-db";
import { asc, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { syncV2Keys } from "../../../../packages/database/scripts/sync-v2-keys";
import { handlePush } from "./v2/push";

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

async function insertRebalancing(
  userId: string,
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
    startedAt: T1,
    updatedAt: options.updatedAt ?? T1,
    deletedAt: options.deletedAt ?? null,
  });
  return id;
}

/** 할 일 행 하나 (번호·순서 없이). */
async function insertTask(userId: string, rebalancingId: string, allocationId: string) {
  const id = deriveRecordId(rebalancingTask, { parentId: rebalancingId, fields: { allocationId } });
  await db.insert(schema.rebalancingTask).values({
    id,
    userId,
    rebalancingId,
    allocationId,
    market: "KR",
    ticker: allocationId,
    name: allocationId,
    action: "매수",
    amount: 10000,
    done: false,
  });
  return id;
}

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

  it("orders root records by creation", async () => {
    const userId = await createTestUser();
    const third = await insertAccount(userId, T1, T3);
    const first = await insertAccount(userId, T1, T1);
    const second = await insertAccount(userId, T1, T2);

    await backfill(userId);

    const rows = await db
      .select({ id: schema.investmentAccount.id })
      .from(schema.investmentAccount)
      .where(eq(schema.investmentAccount.userId, userId))
      .orderBy(asc(schema.investmentAccount.sortKey));
    expect(rows.map((r) => r.id)).toEqual([first, second, third]);
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

  it("tombstones the children of a deleted parent", async () => {
    const userId = await createTestUser();
    const accountId = await insertAccount(userId, T1);
    await insertHoldings(accountId, ["삼성전자"]);
    await db
      .update(schema.investmentAccount)
      .set({ deletedAt: T2 })
      .where(eq(schema.investmentAccount.id, accountId));
    const rebalancingId = await insertRebalancing(userId, { deletedAt: T2 });
    const taskId = await insertTask(userId, rebalancingId, "alloc-1");

    await backfill(userId);

    const [holding] = await db
      .select()
      .from(schema.stockHolding)
      .where(eq(schema.stockHolding.accountId, accountId));
    const [taskRow] = await db
      .select()
      .from(schema.rebalancingTask)
      .where(eq(schema.rebalancingTask.id, taskId));
    expect([holding?.deletedAt, taskRow?.deletedAt]).toEqual([T2, T2]);
  });

  it("numbers every record once in updatedAt order, parents before children", async () => {
    const userId = await createTestUser();
    const later = await insertAccount(userId, T2);
    const earlier = await insertAccount(userId, T1);
    const [holding] = await insertHoldings(earlier, ["삼성전자"]);
    const rebalancingId = await insertRebalancing(userId, { updatedAt: T3 });
    const taskId = await insertTask(userId, rebalancingId, "alloc-1");
    await db.insert(schema.userPreference).values({ userId });

    await backfill(userId);

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
    const rebalancingId = await insertRebalancing(userId);
    await insertTask(userId, rebalancingId, "alloc-1");
    await insertTask(userId, rebalancingId, "alloc-2");
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
});

// ─── v2 로 쓴 행 ─────────────────────────────────────────────────────────────

/** v2 push (`/api/sync/v2/push`) 로 쓴다 — 결과가 모두 ok 여야 한다. */
async function push(userId: string, ops: SyncOp[]) {
  const res = await handlePush(
    new Request("http://localhost/api/sync/v2/push", {
      method: "POST",
      headers: { "x-seedbook-sync": "2", "x-seedbook-schema": String(SCHEMA_VERSION) },
      body: JSON.stringify({ ops }),
    }),
    { db, resolveUserId: async () => userId, log: () => {} }
  );
  const { results } = (await res.json()) as { results: SyncOpResult[] };
  expect(results.map((r) => r.status)).toEqual(ops.map(() => "ok"));
}

const v2Task = (allocationId: string) => ({
  allocationId,
  market: "KR",
  ticker: allocationId,
  name: allocationId,
  action: "매수",
  amount: 10000,
  price: 5000,
  quantity: 2,
  done: false,
});

const taskIdOf = (rebalancingId: string, allocationId: string) =>
  deriveRecordId(rebalancingTask, { parentId: rebalancingId, fields: { allocationId } });

/** 사용자의 할 일·보유 종목 행 전부 (backfill 전후 비교). */
async function syncRows(userId: string) {
  return {
    seqs: await changeSeqs(userId),
    tasks: await db
      .select()
      .from(schema.rebalancingTask)
      .where(eq(schema.rebalancingTask.userId, userId))
      .orderBy(asc(schema.rebalancingTask.id)),
    holdings: await db
      .select()
      .from(schema.stockHolding)
      .where(eq(schema.stockHolding.userId, userId))
      .orderBy(asc(schema.stockHolding.id)),
    sessions: await db
      .select()
      .from(schema.rebalancing)
      .where(eq(schema.rebalancing.userId, userId))
      .orderBy(asc(schema.rebalancing.id)),
    syncState: await syncStateSeq(userId),
  };
}

describe("backfillUserSyncV2 after v2 writes", () => {
  it("leaves records created through v2 alone", async () => {
    const userId = await createTestUser();
    const rebalancingId = randomUUID();
    const accountId = randomUUID();
    await push(userId, [
      {
        type: "account",
        id: accountId,
        op: "create",
        sortKey: "a1",
        fields: {
          accountName: "계좌",
          accountType: "일반",
          currency: "KRW",
          initialInvestment: 0,
          currentValue: 0,
          color: "#000000",
        },
      },
      {
        type: "holding",
        id: randomUUID(),
        parentId: accountId,
        op: "create",
        sortKey: "a5",
        fields: { market: "KR", ticker: "005930", name: "삼성전자", currency: "KRW", quantity: 1 },
      },
      {
        type: "rebalancing",
        id: rebalancingId,
        op: "create",
        sortKey: "a1",
        fields: {
          accountId,
          accountName: "계좌",
          portfolioId: "pf",
          portfolioName: "포트폴리오",
          cashDelta: 0,
          startedAt: "2026-11-28T00:00:00.000Z",
        },
      },
      ...["alloc-1", "alloc-2"].map(
        (allocationId, i): SyncOp => ({
          type: "rebalancingTask",
          id: taskIdOf(rebalancingId, allocationId),
          parentId: rebalancingId,
          op: "create",
          sortKey: `a${i + 1}`,
          fields: v2Task(allocationId),
        })
      ),
    ]);
    const before = await syncRows(userId);

    const summary = await backfill(userId);

    expect(Object.values(summary).every((n) => n === 0)).toBe(true);
    expect(await syncRows(userId)).toEqual(before);
    expect(before.tasks.filter((r) => r.deletedAt === null)).toHaveLength(2);
  });
});
