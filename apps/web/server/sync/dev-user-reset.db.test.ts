import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { schema } from "@seedbook/database";
import {
  deriveRecordId,
  type PulledRecord,
  type PullResponse,
  rebalancingTask,
  SCHEMA_VERSION,
  type SyncOp,
  type SyncOpResult,
} from "@seedbook/domain";
import { openTestDb } from "@web/test/db/test-db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  resetDevUserData,
  seedDevUserData,
} from "../../../../packages/database/scripts/dev-user-data";
import { handlePull } from "./v2/pull";
import { handlePush } from "./v2/push";

/**
 * dev 시드·`db:seed:reset` 이 쓴 레코드가 동기화 v2 pull 에 나오는지. 픽스처 id 는 고정이라 이
 * 파일 안에서도 테스트가 끝나면 사용자를 지운다 (같은 id 를 두 사용자가 가질 수 없다).
 */

const { db, createTestUser: createUser, close } = openTestDb();
afterAll(close);

// 픽스처 행을 다음 테스트의 사용자가 쓸 수 있게 테스트마다 사용자(→ cascade)를 지운다.
let currentUserId: string | null = null;
async function createTestUser() {
  currentUserId = await createUser();
  return currentUserId;
}
afterEach(async () => {
  if (currentUserId) await db.delete(schema.user).where(eq(schema.user.id, currentUserId));
  currentUserId = null;
});

type Fixture = {
  investments: Array<{
    id: string;
    records?: Array<{ date: string }>;
    holdings?: Array<{ id: string; quantity: number }>;
    cashItems?: Array<{ id: string }>;
  }>;
  portfolios: Array<{ id: string; allocations: Array<{ id: string }> }>;
};

const fixture = JSON.parse(
  readFileSync(resolve(__dirname, "../../../../packages/database/seed-data/user-data.json"), "utf8")
) as Fixture;

const HEADERS = { "x-seedbook-sync": "2", "x-seedbook-schema": String(SCHEMA_VERSION) };
const deps = (userId: string) => ({ db, resolveUserId: async () => userId, log: () => {} });

async function push(userId: string, ops: SyncOp[]): Promise<SyncOpResult[]> {
  const res = await handlePush(
    new Request("http://localhost/api/sync/v2/push", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ ops }),
    }),
    deps(userId)
  );
  expect(res.status).toBe(200);
  return ((await res.json()) as { results: SyncOpResult[] }).results;
}

async function pullAll(userId: string, cursor?: string) {
  const records: PulledRecord[] = [];
  let next = cursor;
  for (;;) {
    const params = new URLSearchParams();
    if (next) params.set("cursor", next);
    const res = await handlePull(
      new Request(`http://localhost/api/sync/v2/pull?${params}`, { headers: HEADERS }),
      deps(userId)
    );
    expect(res.status).toBe(200);
    const page = (await res.json()) as PullResponse;
    records.push(...page.records);
    next = page.cursor;
    if (!page.hasMore) return { records, cursor: next };
  }
}

/** 픽스처가 쓰는 레코드 (type:id). 기록은 id 가 uuidv5 라 계좌·날짜로 센다. */
function fixtureKeys(): string[] {
  const keys: string[] = [];
  for (const inv of fixture.investments) {
    keys.push(`account:${inv.id}`);
    for (const h of inv.holdings ?? []) keys.push(`holding:${h.id}`);
    for (const c of inv.cashItems ?? []) keys.push(`cash:${c.id}`);
  }
  for (const p of fixture.portfolios) {
    keys.push(`portfolio:${p.id}`);
    for (const a of p.allocations) keys.push(`allocation:${a.id}`);
  }
  return keys.sort();
}

const liveKeys = (records: PulledRecord[]) =>
  records
    .filter((r) => r.deletedAt === null && r.type !== "accountRecord" && r.type !== "settings")
    .map((r) => `${r.type}:${r.id}`)
    .sort();

const recordCount = () => fixture.investments.reduce((n, inv) => n + (inv.records?.length ?? 0), 0);

const latest = (records: PulledRecord[], id: string) =>
  records.filter((r) => r.id === id).at(-1) ?? null;

describe("dev user seed", () => {
  it("numbers every seeded record so a first v2 pull gets the whole scenario", async () => {
    const userId = await createTestUser();

    await seedDevUserData(userId, db);
    const { records } = await pullAll(userId);

    expect(liveKeys(records)).toEqual(fixtureKeys());
    expect(records.filter((r) => r.type === "accountRecord")).toHaveLength(recordCount());
    expect(records.every((r) => r.sortKey !== null || r.type === "accountRecord")).toBe(true);
  });
});

describe("dev user reset", () => {
  it("brings changed and deleted records to a v2 pull after the previous cursor", async () => {
    const userId = await createTestUser();
    await seedDevUserData(userId, db);
    const [firstAccount] = fixture.investments;
    const [firstHolding] = firstAccount?.holdings ?? [];
    if (!firstAccount || !firstHolding) throw new Error("fixture has no holding");

    // 시나리오를 벗어난 변경: 계좌·보유 종목 추가, 픽스처 종목 수정, 리밸런싱·할 일, 설정.
    const extraAccountId = randomUUID();
    const extraHoldingId = randomUUID();
    const rebalancingId = randomUUID();
    const taskFields = {
      allocationId: "alloc-1",
      market: "KR",
      ticker: "005930",
      name: "삼성전자",
      action: "매수",
      amount: 100_000,
      price: 70_000,
      quantity: 1,
      done: false,
    };
    const taskId = deriveRecordId(rebalancingTask, { parentId: rebalancingId, fields: taskFields });
    const results = await push(userId, [
      {
        type: "account",
        id: extraAccountId,
        op: "create",
        fields: {
          accountName: "추가 계좌",
          accountType: "일반",
          currency: "KRW",
          initialInvestment: 0,
          currentValue: 0,
          color: "#000000",
        },
      },
      {
        type: "holding",
        id: extraHoldingId,
        parentId: extraAccountId,
        op: "create",
        fields: {
          market: "KR",
          ticker: "000660",
          name: "SK하이닉스",
          currency: "KRW",
          quantity: 3,
        },
      },
      { type: "holding", id: firstHolding.id, op: "patch", fields: { quantity: 1 } },
      {
        type: "rebalancing",
        id: rebalancingId,
        op: "create",
        fields: {
          accountId: firstAccount.id,
          accountName: "계좌",
          portfolioId: "pf",
          portfolioName: "포트폴리오",
          cashDelta: 0,
          startedAt: "2026-11-28T00:00:00.000Z",
        },
      },
      {
        type: "rebalancingTask",
        id: taskId,
        parentId: rebalancingId,
        op: "create",
        fields: taskFields,
      },
      { type: "settings", id: userId, op: "create", fields: { accountSortOption: "evalAsc" } },
    ]);
    expect(results.map((r) => r.status)).toEqual(["ok", "ok", "ok", "ok", "ok", "ok"]);
    const { cursor } = await pullAll(userId);

    await resetDevUserData(userId, db);
    const { records } = await pullAll(userId, cursor);

    expect(liveKeys(records)).toEqual(fixtureKeys());
    expect(records.filter((r) => r.type === "accountRecord")).toHaveLength(recordCount());
    expect(latest(records, firstHolding.id)?.fields.quantity).toBe(firstHolding.quantity);
    for (const id of [extraAccountId, extraHoldingId, rebalancingId, taskId]) {
      expect(latest(records, id)?.deletedAt, id).not.toBeNull();
    }
    expect(latest(records, userId)?.fields.accountSortOption).toBe("evalDesc");
  });

  it("is repeatable: a second reset is pulled again with fresh numbers", async () => {
    const userId = await createTestUser();
    await seedDevUserData(userId, db);
    const { cursor } = await pullAll(userId);

    await resetDevUserData(userId, db);
    const { records } = await pullAll(userId, cursor);

    expect(liveKeys(records)).toEqual(fixtureKeys());
  });
});
