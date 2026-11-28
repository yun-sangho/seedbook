import { randomUUID } from "node:crypto";
import { type PulledRecord, type PullResponse, SCHEMA_VERSION } from "@seedbook/domain";
import { TRANSLATORS } from "@web/app/api/storage/_translators";
import { openTestDb } from "@web/test/db/test-db";
import { afterAll, describe, expect, it } from "vitest";
import { applyMutation } from "./apply-mutation";
import { handlePull } from "./v2/pull";
import { handlePush } from "./v2/push";

/**
 * 옛 JS 를 캐시한 브라우저·PWA 는 배포 뒤에도 한동안 v1 (`/api/sync/mutations`, `/api/storage/[key]`)
 * 로 쓴다. 그 변경이 v2 pull 에 나와야 한다 — v1 쓰기도 `user_sync_state` 로 새 번호를 받는다.
 */

const { db, createTestUser, close } = openTestDb();
afterAll(close);

const HEADERS = { "x-seedbook-sync": "2", "x-seedbook-schema": String(SCHEMA_VERSION) };

async function pullAll(userId: string, cursor?: string) {
  const records: PulledRecord[] = [];
  let next = cursor;
  for (;;) {
    const params = new URLSearchParams();
    if (next) params.set("cursor", next);
    const res = await handlePull(
      new Request(`http://localhost/api/sync/v2/pull?${params}`, { headers: HEADERS }),
      { db, resolveUserId: async () => userId, log: () => {} }
    );
    const page = (await res.json()) as PullResponse;
    records.push(...page.records);
    next = page.cursor;
    if (!page.hasMore) return { records, cursor: next };
  }
}

const find = (records: PulledRecord[], type: string, id: string) =>
  records.find((r) => r.type === type && r.id === id);

function investment(
  ids: { holding1: string; holding2?: string; cash: string },
  quantity = 10
): Record<string, unknown> {
  const holdings = [
    {
      id: ids.holding1,
      market: "KRX",
      ticker: "005930",
      name: "삼성전자",
      currency: "KRW",
      quantity,
      memo: "",
    },
  ];
  if (ids.holding2) {
    holdings.push({
      id: ids.holding2,
      market: "KRX",
      ticker: "000660",
      name: "SK하이닉스",
      currency: "KRW",
      quantity: 3,
      memo: "",
    });
  }
  return {
    accountName: "연금",
    accountType: "연금",
    currency: "KRW",
    initialInvestment: 1_000_000,
    currentValue: 1_100_000,
    note: "",
    color: "#00aa00",
    sellCostPercent: 0,
    records: [{ date: "2026-11-01", initialInvestment: 1_000_000, currentValue: 1_100_000 }],
    holdings,
    cashItems: [{ id: ids.cash, label: "예수금", amount: 50_000 }],
  };
}

function portfolioData() {
  return {
    name: "안정형",
    color: "#000000",
    note: "",
    accountIds: [] as string[],
    driftMode: "relative",
    driftThresholdPercent: 5,
    goalAmount: null,
    growthStage: 0,
    goalHistory: [],
    allocations: [
      {
        id: randomUUID(),
        market: "KRX",
        ticker: "005930",
        name: "삼성전자",
        currency: "KRW",
        targetPercent: 100,
      },
    ],
  };
}

describe("v1 writes show up in the v2 pull", () => {
  it("numbers a v1 mutation's account and its children", async () => {
    const userId = await createTestUser();
    const account = randomUUID();
    const ids = { holding1: randomUUID(), holding2: randomUUID(), cash: randomUUID() };

    await applyMutation(db, userId, {
      entity: "investment",
      op: "upsert",
      id: account,
      data: investment(ids),
    });

    const { records } = await pullAll(userId);
    expect(find(records, "account", account)?.fields.accountName).toBe("연금");
    expect(find(records, "holding", ids.holding1)?.parentId).toBe(account);
    expect(find(records, "holding", ids.holding2)).toBeDefined();
    expect(find(records, "cash", ids.cash)).toBeDefined();
    expect(records.filter((r) => r.type === "accountRecord")).toHaveLength(1);
  });

  it("delivers a v1 edit and a v1-removed child to a device that already synced", async () => {
    const userId = await createTestUser();
    const account = randomUUID();
    const ids = { holding1: randomUUID(), holding2: randomUUID(), cash: randomUUID() };
    await applyMutation(db, userId, {
      entity: "investment",
      op: "upsert",
      id: account,
      data: investment(ids),
    });
    const { cursor } = await pullAll(userId);

    // 옛 기기가 첫 종목 수량을 고치고 두 번째 종목을 지운다 (v1 은 하위 목록을 통째로 보낸다).
    await applyMutation(db, userId, {
      entity: "investment",
      op: "upsert",
      id: account,
      data: investment({ holding1: ids.holding1, cash: ids.cash }, 12),
    });

    const { records } = await pullAll(userId, cursor);
    expect(find(records, "holding", ids.holding1)?.fields.quantity).toBe(12);
    expect(find(records, "holding", ids.holding2)?.deletedAt).toEqual(expect.any(String));
  });

  it("keeps the list order of a v1 save as sort keys", async () => {
    const userId = await createTestUser();
    const account = randomUUID();
    const ids = { holding1: randomUUID(), holding2: randomUUID(), cash: randomUUID() };
    await applyMutation(db, userId, {
      entity: "investment",
      op: "upsert",
      id: account,
      data: investment(ids),
    });
    const data = investment(ids) as { holdings: unknown[] };
    data.holdings.reverse();

    await applyMutation(db, userId, { entity: "investment", op: "upsert", id: account, data });

    const { records } = await pullAll(userId);
    const key = (id: string) => find(records, "holding", id)?.sortKey ?? "";
    expect(key(ids.holding2) < key(ids.holding1)).toBe(true);
  });

  it("delivers a v1 delete as a tombstone", async () => {
    const userId = await createTestUser();
    const account = randomUUID();
    const ids = { holding1: randomUUID(), cash: randomUUID() };
    await applyMutation(db, userId, {
      entity: "investment",
      op: "upsert",
      id: account,
      data: investment(ids),
    });
    const { cursor } = await pullAll(userId);

    await applyMutation(db, userId, { entity: "investment", op: "delete", id: account });

    const { records } = await pullAll(userId, cursor);
    expect(find(records, "account", account)?.deletedAt).toEqual(expect.any(String));
    expect(find(records, "holding", ids.holding1)?.deletedAt).toEqual(expect.any(String));
  });

  it("delivers a v1 portfolio link as the account's portfolioId", async () => {
    const userId = await createTestUser();
    const account = randomUUID();
    const portfolio = randomUUID();
    await applyMutation(db, userId, {
      entity: "investment",
      op: "upsert",
      id: account,
      data: investment({ holding1: randomUUID(), cash: randomUUID() }),
    });
    const { cursor } = await pullAll(userId);

    await applyMutation(db, userId, {
      entity: "portfolio",
      op: "upsert",
      id: portfolio,
      data: { ...portfolioData(), accountIds: [account] },
    });

    const { records } = await pullAll(userId, cursor);
    expect(find(records, "portfolio", portfolio)).toBeDefined();
    expect(records.filter((r) => r.type === "allocation")).toHaveLength(1);
    expect(find(records, "account", account)?.fields.portfolioId).toBe(portfolio);
  });

  it("does not undo a link a v2 device made when a v1 client saves another portfolio", async () => {
    const userId = await createTestUser();
    const [accountX, accountY, v2Portfolio, v1Portfolio] = [1, 2, 3, 4].map(() => randomUUID()) as [
      string,
      string,
      string,
      string,
    ];
    for (const id of [accountX, accountY]) {
      await applyMutation(db, userId, {
        entity: "investment",
        op: "upsert",
        id,
        data: investment({ holding1: randomUUID(), cash: randomUUID() }),
      });
    }
    // v2 기기가 포트폴리오를 만들고 계좌 X 를 잇는다 (portfolio.accountIds 는 비어 있다).
    const pushed = await handlePush(
      new Request("http://localhost/api/sync/v2/push", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({
          ops: [
            {
              type: "portfolio",
              id: v2Portfolio,
              op: "create",
              fields: { name: "v2", color: "#000000" },
            },
            { type: "account", id: accountX, op: "patch", fields: { portfolioId: v2Portfolio } },
          ],
        }),
      }),
      { db, resolveUserId: async () => userId, log: () => {} }
    );
    expect(pushed.status).toBe(200);

    await applyMutation(db, userId, {
      entity: "portfolio",
      op: "upsert",
      id: v1Portfolio,
      data: { ...portfolioData(), accountIds: [accountY] },
    });

    const { records } = await pullAll(userId);
    expect(find(records, "account", accountX)?.fields.portfolioId).toBe(v2Portfolio);
    expect(find(records, "account", accountY)?.fields.portfolioId).toBe(v1Portfolio);
  });

  it("delivers an envelope (/api/storage) write, rebalancing tasks included", async () => {
    const userId = await createTestUser();
    const session = randomUUID();
    const { cursor } = await pullAll(userId);

    await TRANSLATORS["rebalancing-storage"].write(db, userId, {
      state: {
        sessions: [
          {
            id: session,
            accountId: randomUUID(),
            accountName: "연금",
            portfolioId: randomUUID(),
            portfolioName: "안정형",
            cashDelta: 0,
            tasks: [
              {
                id: "alloc-1",
                market: "KRX",
                ticker: "005930",
                name: "삼성전자",
                action: "매수",
                amount: 100_000,
                price: 50_000,
                quantity: 2,
                done: false,
              },
            ],
            startedAt: "2026-11-01T00:00:00.000Z",
            completedAt: null,
          },
        ],
      },
      version: 1,
    });

    const { records } = await pullAll(userId, cursor);
    expect(find(records, "rebalancing", session)).toBeDefined();
    expect(records.filter((r) => r.type === "rebalancingTask")).toEqual([
      expect.objectContaining({
        parentId: session,
        fields: expect.objectContaining({ done: false }),
      }),
    ]);
  });
});
