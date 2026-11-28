import { randomUUID } from "node:crypto";
import { schema } from "@seedbook/database";
import {
  accountRecord,
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
import { afterAll, describe, expect, it } from "vitest";
import { encodeCursor, handlePull } from "./pull";
import { handlePush } from "./push";

const { db, createTestUser, close } = openTestDb();
afterAll(close);

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

async function pull(userId: string, cursor?: string, limit?: number): Promise<PullResponse> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (limit) params.set("limit", String(limit));
  const res = await handlePull(
    new Request(`http://localhost/api/sync/v2/pull?${params}`, { headers: HEADERS }),
    deps(userId)
  );
  expect(res.status).toBe(200);
  return (await res.json()) as PullResponse;
}

/** hasMore 가 끝날 때까지 받는다. */
async function pullAll(userId: string, cursor?: string, limit?: number) {
  const records: PulledRecord[] = [];
  let next = cursor;
  for (;;) {
    const page = await pull(userId, next, limit);
    records.push(...page.records);
    next = page.cursor;
    if (!page.hasMore) return { records, cursor: next };
  }
}

const accountFields = (overrides: Record<string, unknown> = {}) => ({
  accountName: "연금저축",
  accountType: "연금",
  currency: "KRW",
  initialInvestment: 1_000_000,
  currentValue: 1_200_000,
  color: "#00aa00",
  ...overrides,
});

const holdingFields = (overrides: Record<string, unknown> = {}) => ({
  market: "KR",
  ticker: "005930",
  name: "삼성전자",
  currency: "KRW",
  quantity: 10,
  ...overrides,
});

const createAccount = (id: string, fields = accountFields()): SyncOp => ({
  type: "account",
  id,
  op: "create",
  fields,
});

const createHolding = (id: string, accountId: string, fields = holdingFields()): SyncOp => ({
  type: "holding",
  id,
  parentId: accountId,
  op: "create",
  fields,
});

const byId = (records: PulledRecord[], id: string) => records.filter((r) => r.id === id);

describe("push: create and patch", () => {
  it("creates a parent and its children in one push and pulls them with full fields", async () => {
    const userId = await createTestUser();
    const accountId = randomUUID();
    const holdingId = randomUUID();
    const cashId = randomUUID();

    const results = await push(userId, [
      createAccount(accountId),
      createHolding(holdingId, accountId),
      {
        type: "cash",
        id: cashId,
        parentId: accountId,
        op: "create",
        fields: { label: "예수금", amount: 50_000 },
      },
    ]);
    const { records } = await pullAll(userId);

    expect(results.map((r) => r.status)).toEqual(["ok", "ok", "ok"]);
    expect(records.map((r) => [r.type, r.id, r.parentId])).toEqual([
      ["account", accountId, null],
      ["holding", holdingId, accountId],
      ["cash", cashId, accountId],
    ]);
    expect(records[1]?.fields).toEqual({ ...holdingFields(), memo: "" });
    expect(records[0]?.fields).toMatchObject({
      note: "",
      portfolioId: null,
      currentValue: 1_200_000,
    });
  });

  it("patches only the fields it sends", async () => {
    const userId = await createTestUser();
    const accountId = randomUUID();
    const holdingId = randomUUID();
    await push(userId, [
      createAccount(accountId),
      createHolding(holdingId, accountId, holdingFields({ memo: "장기 보유" })),
    ]);

    await push(userId, [{ type: "holding", id: holdingId, op: "patch", fields: { quantity: 12 } }]);
    const { records } = await pullAll(userId);

    expect(byId(records, holdingId)[0]?.fields).toMatchObject({ quantity: 12, memo: "장기 보유" });
  });

  it("does not fill defaults into a patch (an old app's patch keeps newer fields)", async () => {
    const userId = await createTestUser();
    const portfolioId = randomUUID();
    await push(userId, [
      {
        type: "portfolio",
        id: portfolioId,
        op: "create",
        fields: { name: "안정형", color: "#123456", driftMode: "relative", growthStage: 2 },
      },
    ]);

    await push(userId, [
      { type: "portfolio", id: portfolioId, op: "patch", fields: { name: "성장형" } },
    ]);
    const { records } = await pullAll(userId);

    expect(records[0]?.fields).toMatchObject({
      name: "성장형",
      driftMode: "relative",
      growthStage: 2,
    });
  });

  it("applies the valid fields and reports the rejected ones as partial", async () => {
    const userId = await createTestUser();
    const accountId = randomUUID();
    const holdingId = randomUUID();
    await push(userId, [createAccount(accountId), createHolding(holdingId, accountId)]);

    const [result] = await push(userId, [
      {
        type: "holding",
        id: holdingId,
        op: "patch",
        fields: { quantity: 12, memo: 123 },
      },
    ]);
    const { records } = await pullAll(userId);

    expect(result).toMatchObject({
      status: "partial",
      rejected: [{ field: "memo", code: "type" }],
    });
    expect(byId(records, holdingId)[0]?.fields).toMatchObject({ quantity: 12, memo: "" });
  });

  it("rejects a create whose required fields are missing, listing them", async () => {
    const userId = await createTestUser();

    const [result] = await push(userId, [
      { type: "account", id: randomUUID(), op: "create", fields: { accountName: "이름만" } },
    ]);

    expect(result).toMatchObject({ status: "rejected", code: "invalid" });
    expect(result?.status === "rejected" && result.rejected?.map((r) => r.field)).toEqual([
      "accountType",
      "currency",
      "initialInvestment",
      "currentValue",
      "color",
    ]);
  });

  it("answers not_found for a patch of an unknown record", async () => {
    const userId = await createTestUser();

    const [result] = await push(userId, [
      { type: "holding", id: randomUUID(), op: "patch", fields: { quantity: 1 } },
    ]);

    expect(result).toEqual({ status: "rejected", code: "not_found" });
  });

  it("refuses another user's records", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const accountId = randomUUID();
    await push(owner, [createAccount(accountId)]);

    const results = await push(other, [
      { type: "account", id: accountId, op: "patch", fields: { accountName: "남의 계좌" } },
      createHolding(randomUUID(), accountId),
      { type: "account", id: accountId, op: "delete" },
    ]);

    expect(results.map((r) => r.status === "rejected" && r.code)).toEqual([
      "forbidden",
      "forbidden",
      "forbidden",
    ]);
  });

  it("rejects unknown types, bad ids and bad ops without failing the rest", async () => {
    const userId = await createTestUser();

    const results = await push(userId, [
      { type: "goal", id: randomUUID(), op: "create", fields: {} },
      { type: "account", id: "not-a-uuid", op: "create", fields: accountFields() },
      { type: "account", id: randomUUID(), op: "upsert" as "create", fields: accountFields() },
      createAccount(randomUUID()),
    ]);

    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected", "rejected", "ok"]);
  });
});

describe("push: replay", () => {
  it("gives the same results and the same data when the same push is sent twice", async () => {
    const userId = await createTestUser();
    const accountId = randomUUID();
    const holdingId = randomUUID();
    const ops: SyncOp[] = [
      createAccount(accountId),
      createHolding(holdingId, accountId),
      {
        type: "cash",
        id: randomUUID(),
        parentId: accountId,
        op: "create",
        fields: { label: "예수금", amount: 1 },
      },
      { type: "cash", id: randomUUID(), op: "delete" },
    ];

    const first = await push(userId, ops);
    const afterFirst = await pullAll(userId);
    const second = await push(userId, ops);
    const afterSecond = await pull(userId, afterFirst.cursor);

    expect(second).toEqual(first);
    expect(afterSecond.records).toEqual([]);
    expect((await pullAll(userId)).records).toEqual(afterFirst.records);
  });

  it("ends with the same data when a push that creates then patches is replayed", async () => {
    const userId = await createTestUser();
    const accountId = randomUUID();
    const holdingId = randomUUID();
    const ops: SyncOp[] = [
      createAccount(accountId),
      createHolding(holdingId, accountId),
      { type: "holding", id: holdingId, op: "patch", fields: { quantity: 15 } },
    ];

    await push(userId, ops);
    const afterFirst = await pullAll(userId);
    await push(userId, ops);
    const afterSecond = await pullAll(userId);

    const fieldsOf = (records: PulledRecord[]) => records.map((r) => [r.id, r.fields]);
    expect(fieldsOf(afterSecond.records)).toEqual(fieldsOf(afterFirst.records));
  });

  it("re-sending a create for an existing record patches only what changed", async () => {
    const userId = await createTestUser();
    const accountId = randomUUID();
    await push(userId, [createAccount(accountId)]);
    await push(userId, [
      { type: "account", id: accountId, op: "patch", fields: { note: "다른 기기 메모" } },
    ]);

    const [result] = await push(userId, [
      createAccount(accountId, accountFields({ color: "#fff" })),
    ]);
    const { records } = await pullAll(userId);

    expect(result).toMatchObject({ status: "ok", version: 3 });
    // 재전송한 create 는 기본값(note: "")을 채우지 않는다.
    expect(records[0]?.fields).toMatchObject({ color: "#fff", note: "다른 기기 메모" });
  });
});

describe("delete wins", () => {
  it("tombstones the children of a deleted parent in the same push", async () => {
    const userId = await createTestUser();
    const accountId = randomUUID();
    const holdingId = randomUUID();
    await push(userId, [createAccount(accountId), createHolding(holdingId, accountId)]);
    const { cursor } = await pullAll(userId);

    const [result] = await push(userId, [{ type: "account", id: accountId, op: "delete" }]);
    const { records } = await pull(userId, cursor);

    expect(result).toMatchObject({ status: "ok", version: 2 });
    expect(records.map((r) => [r.type, r.deletedAt !== null])).toEqual([
      ["account", true],
      ["holding", true],
    ]);
  });

  it("ignores patches and creates for a tombstoned record (no resurrection)", async () => {
    const userId = await createTestUser();
    const accountId = randomUUID();
    await push(userId, [createAccount(accountId)]);
    await push(userId, [{ type: "account", id: accountId, op: "delete" }]);
    const { cursor } = await pullAll(userId);

    const results = await push(userId, [
      { type: "account", id: accountId, op: "patch", fields: { accountName: "되살리기" } },
      createAccount(accountId),
      { type: "account", id: accountId, op: "delete" },
    ]);

    expect(results.map((r) => r.status === "rejected" && r.code)).toEqual([
      "deleted",
      "deleted",
      false,
    ]);
    expect((await pull(userId, cursor)).records).toEqual([]);
  });

  it("refuses to create or patch a child under a tombstoned parent", async () => {
    const userId = await createTestUser();
    const accountId = randomUUID();
    const holdingId = randomUUID();
    await push(userId, [createAccount(accountId), createHolding(holdingId, accountId)]);
    // v1 경로처럼 부모만 톰스톤이고 하위 행은 살아 있는 상태.
    await db
      .update(schema.investmentAccount)
      .set({ deletedAt: new Date() })
      .where(eq(schema.investmentAccount.id, accountId));

    const results = await push(userId, [
      createHolding(randomUUID(), accountId),
      { type: "holding", id: holdingId, op: "patch", fields: { quantity: 1 } },
    ]);

    expect(results.map((r) => r.status === "rejected" && r.code)).toEqual([
      "parent_deleted",
      "parent_deleted",
    ]);
  });

  it("answers parent_missing for a child whose parent does not exist", async () => {
    const userId = await createTestUser();

    const [result] = await push(userId, [createHolding(randomUUID(), randomUUID())]);

    expect(result).toEqual({ status: "rejected", code: "parent_missing" });
  });

  it("tombstones rebalancing tasks with their rebalancing", async () => {
    const userId = await createTestUser();
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
    await push(userId, [
      {
        type: "rebalancing",
        id: rebalancingId,
        op: "create",
        fields: {
          accountId: "acc",
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
    ]);

    await push(userId, [{ type: "rebalancing", id: rebalancingId, op: "delete" }]);
    const { records } = await pullAll(userId);
    const [task] = await db
      .select()
      .from(schema.rebalancingTask)
      .where(eq(schema.rebalancingTask.id, taskId));

    expect(records).toEqual([]);
    expect(task?.deletedAt).not.toBeNull();
  });
});

describe("record keys", () => {
  it("accepts an account record only under its derived id and converges on it", async () => {
    const userId = await createTestUser();
    const accountId = randomUUID();
    const fields = { date: "2026-11-27", initialInvestment: 100, currentValue: 110 };
    const id = deriveRecordId(accountRecord, { parentId: accountId, fields });
    await push(userId, [createAccount(accountId)]);

    const results = await push(userId, [
      { type: "accountRecord", id: randomUUID(), parentId: accountId, op: "create", fields },
      { type: "accountRecord", id, parentId: accountId, op: "create", fields },
      {
        type: "accountRecord",
        id,
        parentId: accountId,
        op: "create",
        fields: { ...fields, currentValue: 120 },
      },
      { type: "accountRecord", id, op: "patch", fields: { date: "2026-11-28" } },
    ]);
    const { records } = await pullAll(userId);

    expect(results.map((r) => r.status)).toEqual(["rejected", "ok", "ok", "rejected"]);
    expect(results[3]).toMatchObject({
      code: "invalid",
      rejected: [{ field: "date", code: "immutable" }],
    });
    expect(byId(records, id)[0]?.fields).toEqual({ ...fields, currentValue: 120 });
  });

  it("keys settings by the user and never deletes them", async () => {
    const userId = await createTestUser();

    const results = await push(userId, [
      { type: "settings", id: userId, op: "create", fields: { accountSortOption: "evalAsc" } },
      { type: "settings", id: randomUUID(), op: "create", fields: {} },
      { type: "settings", id: userId, op: "delete" },
    ]);
    const { records } = await pullAll(userId);

    expect(results.map((r) => r.status)).toEqual(["ok", "rejected", "rejected"]);
    expect(records[0]).toMatchObject({
      type: "settings",
      id: userId,
      fields: { accountSortOption: "evalAsc", holdingsSortOption: "evalDesc" },
    });
  });

  it("places a record without a sortKey after its siblings", async () => {
    const userId = await createTestUser();
    const accountId = randomUUID();
    const first = randomUUID();
    const second = randomUUID();
    await push(userId, [
      createAccount(accountId),
      { ...createHolding(first, accountId), sortKey: "a5" },
    ]);

    const [result] = await push(userId, [
      { ...createHolding(second, accountId), sortKey: "not~a~key" },
    ]);
    const { records } = await pullAll(userId);
    const secondKey = byId(records, second)[0]?.sortKey ?? "";

    expect(result).toMatchObject({
      status: "partial",
      rejected: [{ field: "sortKey", code: "type" }],
    });
    expect(secondKey > "a5").toBe(true);
  });
});

describe("pull cursor", () => {
  it("numbers changes in commit order without gaps", async () => {
    const userId = await createTestUser();
    const accountId = randomUUID();
    const holdingId = randomUUID();

    await push(userId, [createAccount(accountId), createHolding(holdingId, accountId)]);
    await push(userId, [
      { type: "holding", id: holdingId, op: "patch", fields: { quantity: 1 } },
      { type: "holding", id: holdingId, op: "patch", fields: { quantity: 1 } }, // 그대로 → 번호 없음
      createHolding(randomUUID(), accountId),
    ]);
    await push(userId, [{ type: "account", id: accountId, op: "delete" }]);
    const { records } = await pullAll(userId, encodeCursor({ s: 0 }));

    // 계좌 1, 보유 1 → 2, 보유 1 패치 3, 보유 2 생성 4, 계좌 삭제 5, 하위 톰스톤 6·7
    expect(records.map((r) => Number(r.changeSeq))).toEqual([5, 6, 7]);
    const [seqState] = await db
      .select()
      .from(schema.userSyncState)
      .where(eq(schema.userSyncState.userId, userId));
    expect(seqState?.seq).toBe(7);
  });

  it("pages through changes in order without duplicates", async () => {
    const userId = await createTestUser();
    const accountId = randomUUID();
    const holdingIds = Array.from({ length: 7 }, () => randomUUID());
    await push(userId, [
      createAccount(accountId),
      ...holdingIds.map((id) => createHolding(id, accountId)),
    ]);

    const paged = await pullAll(userId, undefined, 3);
    const whole = await pullAll(userId);

    expect(paged.records).toEqual(whole.records);
    expect(paged.records.map((r) => Number(r.changeSeq))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(paged.cursor).toBe(whole.cursor);
  });

  it("serializes concurrent pushes of one user into contiguous ranges", async () => {
    const userId = await createTestUser();
    const accountId = randomUUID();
    await push(userId, [createAccount(accountId)]);

    const batches = await Promise.all(
      Array.from({ length: 5 }, () =>
        push(
          userId,
          Array.from({ length: 4 }, () => createHolding(randomUUID(), accountId))
        )
      )
    );
    const { records } = await pullAll(userId);

    const seqs = batches.map((results) =>
      results.map((r) => Number(r.status === "ok" ? r.changeSeq : Number.NaN))
    );
    for (const batch of seqs) {
      // 한 push 의 번호는 다른 push 와 섞이지 않고 이어진다.
      expect(batch).toEqual([0, 1, 2, 3].map((i) => (batch[0] as number) + i));
    }
    expect(records.map((r) => Number(r.changeSeq))).toEqual(
      Array.from({ length: 21 }, (_, i) => i + 1)
    );
  });

  it("gives only live records on the first sync and tombstones afterwards", async () => {
    const userId = await createTestUser();
    const kept = randomUUID();
    const removed = randomUUID();
    await push(userId, [createAccount(kept), createAccount(removed)]);
    await push(userId, [{ type: "account", id: removed, op: "delete" }]);

    const first = await pullAll(userId);
    await push(userId, [{ type: "account", id: kept, op: "delete" }]);
    const next = await pull(userId, first.cursor);

    expect(first.records.map((r) => r.id)).toEqual([kept]);
    expect(next.records.map((r) => [r.id, r.deletedAt !== null])).toEqual([[kept, true]]);
  });

  it("still delivers a delete that happens while the first sync is paging", async () => {
    const userId = await createTestUser();
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    await push(
      userId,
      ids.map((id) => createAccount(id))
    );

    const page1 = await pull(userId, undefined, 1);
    await push(userId, [{ type: "account", id: ids[0] as string, op: "delete" }]);
    const rest = await pullAll(userId, page1.cursor, 1);

    expect(page1.records.map((r) => r.id)).toEqual([ids[0]]);
    expect(rest.records.map((r) => [r.id, r.deletedAt !== null])).toEqual([
      [ids[1], false],
      [ids[2], false],
      [ids[0], true],
    ]);
  });

  it("resets when the cursor is ahead of the server", async () => {
    const userId = await createTestUser();
    const accountId = randomUUID();
    await push(userId, [createAccount(accountId)]);

    const res = await pull(userId, encodeCursor({ s: 999 }));

    expect(res).toMatchObject({ reset: true, hasMore: false });
    expect(res.records.map((r) => r.id)).toEqual([accountId]);
  });

  it("leaves out rows a v1 write has not numbered yet (changeSeq 0)", async () => {
    const userId = await createTestUser();
    await db.insert(schema.investmentAccount).values({
      id: randomUUID(),
      userId,
      ...accountFields(),
      initialInvestment: 0n,
      currentValue: 0n,
      updatedAt: new Date(),
    });

    expect((await pullAll(userId)).records).toEqual([]);
  });
});

describe("a device that was off for a long time", () => {
  it("comes back, loses its edits to deleted records, keeps the rest, and catches up", async () => {
    const userId = await createTestUser();
    const accountId = randomUUID();
    const oldHolding = randomUUID();
    const keptHolding = randomUUID();
    await push(userId, [
      createAccount(accountId),
      createHolding(oldHolding, accountId),
      createHolding(keptHolding, accountId),
    ]);
    // 기기 A 가 마지막으로 동기화한 시점.
    const deviceA = await pullAll(userId);

    // 그동안 다른 기기가 계좌 이름을 바꾸고, 보유 종목 하나를 지우고, 새로 하나 더한다.
    const newHolding = randomUUID();
    await push(userId, [
      { type: "account", id: accountId, op: "patch", fields: { accountName: "새 이름" } },
      { type: "holding", id: oldHolding, op: "delete" },
      createHolding(newHolding, accountId, holdingFields({ ticker: "000660", name: "SK하이닉스" })),
    ]);

    // 기기 A 가 돌아와 outbox 를 보낸다: 지워진 종목 수정, 계좌의 다른 필드 수정, 현금 추가.
    const cashId = randomUUID();
    const outbox = await push(userId, [
      { type: "holding", id: oldHolding, op: "patch", fields: { quantity: 99 } },
      { type: "account", id: accountId, op: "patch", fields: { note: "A 의 메모" } },
      {
        type: "cash",
        id: cashId,
        parentId: accountId,
        op: "create",
        fields: { label: "CMA", amount: 1000 },
      },
    ]);
    const caughtUp = await pullAll(userId, deviceA.cursor);
    const fresh = await pullAll(userId);

    expect(outbox.map((r) => (r.status === "rejected" ? r.code : r.status))).toEqual([
      "deleted",
      "ok",
      "ok",
    ]);
    // 받은 변경을 기기 A 의 사본에 덮으면 새로 받은 전체와 같다.
    const merged = new Map(deviceA.records.map((r) => [r.id, r]));
    for (const record of caughtUp.records) merged.set(record.id, record);
    const live = [...merged.values()].filter((r) => r.deletedAt === null);
    const sortById = (records: PulledRecord[]) =>
      [...records].sort((a, b) => a.id.localeCompare(b.id));
    expect(sortById(live)).toEqual(sortById(fresh.records));
    expect(byId(fresh.records, accountId)[0]?.fields).toMatchObject({
      accountName: "새 이름",
      note: "A 의 메모",
    });
    expect(byId(fresh.records, oldHolding)).toEqual([]);
  });
});
