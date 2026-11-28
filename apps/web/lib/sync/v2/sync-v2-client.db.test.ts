import { randomUUID } from "node:crypto";
import { encodeCursor, handlePull } from "@web/server/sync/v2/pull";
import { handlePush } from "@web/server/sync/v2/push";
import { openTestDb } from "@web/test/db/test-db";
import { afterAll, describe, expect, it } from "vitest";
import { buildRecordBackup, parseBackupFile } from "./backup";
import { createSyncEngine } from "./engine";
import { finishCloudForLocal, mergeLocalIntoCloud } from "./mode-switch";
import { composeStore, INVESTMENT_STORE, PORTFOLIO_STORE } from "./store-records";
import { memoryDevice } from "./testing";

/**
 * 동기화 v2 클라이언트 ↔ 실제 push/pull 핸들러 + 테스트 DB (설계 §9.4 "오래된 기기" 시나리오).
 * 기기는 브라우저와 같은 키-값 레코드 저장소를 쓴다.
 */

const { db, createTestUser, close } = openTestDb();
afterAll(close);

/** 한 사용자의 서버로 보내는 fetch (Next 라우트 대신 핸들러를 바로 부른다). */
function serverFetch(userId: string): typeof fetch {
  const deps = { db, resolveUserId: async () => userId, log: () => {} };
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(new URL(String(input), "http://localhost"), init);
    return String(input).includes("/push") ? handlePush(request, deps) : handlePull(request, deps);
  }) as typeof fetch;
}

function device(userId: string, options: { cloud?: boolean } = {}) {
  const d = memoryDevice({ cloud: options.cloud ?? true });
  const online = { value: true };
  const fetchFn = serverFetch(userId);
  const engine = createSyncEngine({
    layer: d.layer,
    client: "test",
    fetchFn: (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!online.value) throw new TypeError("offline");
      return fetchFn(input, init);
    }) as typeof fetch,
  });
  const investments = async () =>
    composeStore(INVESTMENT_STORE, await d.layer.loadRecords()).investments as Array<
      Record<string, unknown> & { holdings: Array<Record<string, unknown>> }
    >;
  return { ...d, engine, online, investments };
}

const ids = () => ({
  account: randomUUID(),
  holding1: randomUUID(),
  holding2: randomUUID(),
  cash: randomUUID(),
  portfolio: randomUUID(),
});

function accountsEnvelope(
  i: ReturnType<typeof ids>,
  edit: { quantity1?: number; memo1?: string; quantity2?: number | null; note?: string } = {}
) {
  const holdings = [
    {
      id: i.holding1,
      market: "KRX",
      ticker: "005930",
      name: "삼성전자",
      currency: "KRW",
      quantity: edit.quantity1 ?? 10,
      memo: edit.memo1 ?? "",
    },
  ];
  if (edit.quantity2 !== null) {
    holdings.push({
      id: i.holding2,
      market: "KRX",
      ticker: "000660",
      name: "SK하이닉스",
      currency: "KRW",
      quantity: edit.quantity2 ?? 5,
      memo: "",
    });
  }
  return JSON.stringify({
    state: {
      investments: [
        {
          id: i.account,
          accountName: "연금",
          accountType: "연금",
          currency: "KRW",
          initialInvestment: 1_000_000,
          currentValue: 1_200_000,
          note: edit.note ?? "",
          color: "#00aa00",
          records: [],
          holdings,
          cashItems: [{ id: i.cash, label: "예수금", amount: 50_000 }],
        },
      ],
    },
    version: 6,
  });
}

describe("sync v2 client against the real handlers", () => {
  it("brings an old offline device back without losing either device's edits", async () => {
    const userId = await createTestUser();
    const i = ids();
    const b = device(userId);
    const a = device(userId);

    // B 가 만들고, A 가 받는다.
    await b.layer.saveStore(INVESTMENT_STORE, accountsEnvelope(i));
    expect(await b.engine.sync()).toBe("ok");
    expect(await a.engine.sync()).toBe("ok");
    expect((await a.investments())[0]?.holdings).toHaveLength(2);

    // A 는 오프라인에서 편집한다.
    a.online.value = false;
    await a.layer.saveStore(
      INVESTMENT_STORE,
      accountsEnvelope(i, { quantity1: 12, quantity2: 7, note: "A 메모" })
    );
    expect(await a.engine.sync()).toBe("retry");

    // 그동안 B 는 두 번째 종목을 지우고 첫 종목 메모를 고친다.
    await b.layer.saveStore(
      INVESTMENT_STORE,
      accountsEnvelope(i, { memo1: "B 메모", quantity2: null })
    );
    expect(await b.engine.sync()).toBe("ok");

    // A 가 돌아온다.
    a.online.value = true;
    expect(await a.engine.sync()).toBe("ok");
    expect(await b.engine.sync()).toBe("ok");

    for (const d of [a, b]) {
      const [account] = await d.investments();
      expect(account?.note).toBe("A 메모");
      // 다른 필드를 고친 두 기기의 편집이 모두 남고, 지운 종목은 되살아나지 않는다.
      expect(account?.holdings).toEqual([
        expect.objectContaining({ id: i.holding1, quantity: 12, memo: "B 메모" }),
      ]);
    }
    expect(a.layer.loadState().outbox).toEqual({});
  });

  it("keeps waiting edits when the server data was rebuilt (reset)", async () => {
    const userId = await createTestUser();
    const i = ids();
    const a = device(userId);
    await a.layer.saveStore(INVESTMENT_STORE, accountsEnvelope(i));
    expect(await a.engine.sync()).toBe("ok");

    a.online.value = false;
    await a.layer.saveStore(INVESTMENT_STORE, accountsEnvelope(i, { quantity1: 30 }));
    await a.engine.sync();
    // 서버가 다시 만들어져 기기 커서가 서버보다 앞선다.
    await a.layer.applySync((_local, state) => ({
      state: { ...state, cursor: encodeCursor({ s: 1_000_000 }) },
      changes: [],
      result: undefined,
    }));
    a.online.value = true;

    expect(await a.engine.sync()).toBe("ok");
    const fresh = device(userId);
    expect(await fresh.engine.sync()).toBe("ok");
    expect((await fresh.investments())[0]?.holdings[0]).toMatchObject({ quantity: 30 });
  });

  it("merges local data into the cloud and keeps cloud-only records", async () => {
    const userId = await createTestUser();
    const cloudIds = ids();
    const localIds = ids();
    const other = device(userId);
    await other.layer.saveStore(INVESTMENT_STORE, accountsEnvelope(cloudIds));
    expect(await other.engine.sync()).toBe("ok");

    const local = device(userId, { cloud: false });
    await local.layer.saveStore(INVESTMENT_STORE, accountsEnvelope(localIds));
    expect(local.layer.loadState().outbox).toEqual({});

    await mergeLocalIntoCloud(local.engine, local.layer);
    local.setCloud(true);

    expect((await local.investments()).map((a) => a.id).sort()).toEqual(
      [cloudIds.account, localIds.account].sort()
    );
    expect(await other.engine.sync()).toBe("ok");
    expect((await other.investments()).map((a) => a.id).sort()).toEqual(
      [cloudIds.account, localIds.account].sort()
    );
  });

  it("switches to local only after every waiting edit reached the server", async () => {
    const userId = await createTestUser();
    const i = ids();
    const a = device(userId);
    await a.layer.saveStore(INVESTMENT_STORE, accountsEnvelope(i));
    a.online.value = false;

    await expect(finishCloudForLocal(a.engine, a.layer)).rejects.toThrow();
    expect(Object.keys(a.layer.loadState().outbox).length).toBeGreaterThan(0);

    a.online.value = true;
    await finishCloudForLocal(a.engine, a.layer);
    a.setCloud(false);

    expect(a.layer.loadState().outbox).toEqual({});
    expect((await a.investments())[0]?.id).toBe(i.account);
  });

  it("round-trips a backup made from device records, unknown fields included", async () => {
    const userId = await createTestUser();
    const i = ids();
    const a = device(userId);
    await a.layer.saveStore(INVESTMENT_STORE, accountsEnvelope(i));
    await a.layer.saveStore(
      PORTFOLIO_STORE,
      JSON.stringify({
        state: {
          portfolios: [
            {
              id: i.portfolio,
              name: "안정형",
              color: "#000000",
              note: "",
              accountIds: [i.account],
              driftMode: "relative",
              driftThresholdPercent: 5,
              goalAmount: null,
              growthStage: 0,
              goalHistory: [],
              allocations: [],
            },
          ],
        },
        version: 3,
      })
    );
    expect(await a.engine.sync()).toBe("ok");

    const backup = buildRecordBackup(await a.layer.loadRecords(), "tag");
    const parsed = parseBackupFile(JSON.parse(JSON.stringify(backup)));

    expect(parsed.kind).toBe("records");
    if (parsed.kind !== "records") return;
    expect(parsed.records.find((r) => r.type === "account")?.fields.portfolioId).toBe(i.portfolio);
  });
});
