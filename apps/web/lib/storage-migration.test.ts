import { __resetAccountForTests, activateAccount } from "@web/lib/account-storage";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { downloadAllFromCloud, hasAnyLocalData, uploadAllToCloud } from "./storage-migration";
import { getRecordLayer } from "./sync/record-sync";
import { SYNC_STATE_KEY } from "./sync/v2/record-layer";

/**
 * 저장소 모드 전환 헬퍼 테스트. `fetch` 를 모킹해 네트워크 왕복을 흉내낸다.
 */

type FetchCall = { url: string; init: RequestInit | undefined };

function mockFetch(handler: (call: FetchCall) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const impl = async (url: string | URL | Request, init?: RequestInit) => {
    const entry: FetchCall = { url: String(url), init };
    calls.push(entry);
    return handler(entry);
  };
  // biome-ignore lint/suspicious/noExplicitAny: 테스트 대역 — 전역·store 내부 API 에 접근한다.
  (globalThis as any).fetch = impl as any;
  return calls;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(async () => {
  __resetAccountForTests();
  await activateAccount("u");
});

describe("hasAnyLocalData", () => {
  beforeEach(() => window.localStorage.clear());

  it("빈 localStorage 에선 false", async () => {
    expect(await hasAnyLocalData()).toBe(false);
  });

  it("자산이 하나라도 있으면 true", async () => {
    await getRecordLayer().saveStore(
      "investment-storage",
      JSON.stringify({
        state: {
          investments: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              accountName: "a",
              accountType: "일반",
              currency: "KRW",
              initialInvestment: 0,
              currentValue: 0,
              color: "#000000",
            },
          ],
        },
        version: 0,
      })
    );
    expect(await hasAnyLocalData()).toBe(true);
  });
});

const LOCAL = "11111111-1111-4111-8111-1111111111aa";
const CLOUD = "11111111-1111-4111-8111-1111111111bb";

const accountItem = (id: string, accountName: string) => ({
  id,
  accountName,
  accountType: "일반",
  currency: "KRW",
  initialInvestment: 0,
  currentValue: 0,
  note: "",
  color: "#000000",
  records: [],
  holdings: [],
  cashItems: [],
});

const accountFields = (accountName: string) => ({
  accountName,
  accountType: "일반",
  currency: "KRW",
  initialInvestment: 0,
  currentValue: 0,
  note: "",
  color: "#000000",
  portfolioId: null,
});

const serverAccount = (id: string, accountName: string) => ({
  type: "account",
  id,
  parentId: null,
  version: 1,
  changeSeq: "1",
  deletedAt: null,
  sortKey: "a0",
  fields: accountFields(accountName),
});

/** 동기화 v2 서버 흉내: pull 은 가진 레코드를 주고, push 는 받은 op 를 모두 받아들여 레코드에 더한다. */
function fakeSyncServer(
  initial: Array<ReturnType<typeof serverAccount>> = [],
  options: { pushStatus?: number } = {}
) {
  const records = [...initial];
  const pushed: Array<{ type: string; id: string; op: string; fields?: Record<string, unknown> }> =
    [];
  const calls = mockFetch((call) => {
    if (call.url.startsWith("/api/sync/v2/pull")) {
      return jsonResponse({ protocol: 2, records, cursor: "c", hasMore: false, reset: false });
    }
    if (call.url === "/api/sync/v2/push") {
      if (options.pushStatus) return jsonResponse({}, options.pushStatus);
      const { ops } = JSON.parse(String(call.init?.body)) as { ops: typeof pushed };
      pushed.push(...ops);
      for (const op of ops) {
        const existing = records.find((r) => r.id === op.id);
        if (existing) Object.assign(existing.fields, op.fields);
        else records.push({ ...serverAccount(op.id, ""), fields: { ...op.fields } as never });
      }
      return jsonResponse({
        results: ops.map((_, i) => ({ status: "ok", version: 1, changeSeq: String(i + 2) })),
      });
    }
    if (call.url === "/api/account-snapshots") return jsonResponse({ snapshots: [] });
    return jsonResponse({ ok: true });
  });
  return { calls, pushed };
}

const investmentEnvelope = (...items: unknown[]) =>
  JSON.stringify({ state: { investments: items }, version: 0 });

/** 이 기기의 자산 레코드로 저장한다 (화면 store 가 저장하는 길). */
const saveLocal = (...items: unknown[]) =>
  getRecordLayer().saveStore("investment-storage", investmentEnvelope(...items));

describe("uploadAllToCloud", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    // biome-ignore lint/suspicious/noExplicitAny: 테스트 대역 — 전역·store 내부 API 에 접근한다.
    delete (globalThis as any).fetch;
  });

  it("creates the device's records on the server and keeps the cloud-only ones", async () => {
    await saveLocal(accountItem(LOCAL, "로컬"));
    const { pushed } = fakeSyncServer([serverAccount(CLOUD, "클라우드")]);

    await uploadAllToCloud();

    expect(pushed).toEqual([expect.objectContaining({ type: "account", id: LOCAL, op: "create" })]);
    const records = await getRecordLayer().loadRecords();
    expect([...records.values()].map((r) => r.id).sort()).toEqual([LOCAL, CLOUD].sort());
  });

  it("sends only the fields that differ for a record the server already has (local wins)", async () => {
    await saveLocal(accountItem(LOCAL, "새 이름"));
    const { pushed } = fakeSyncServer([serverAccount(LOCAL, "옛 이름")]);

    await uploadAllToCloud();

    expect(pushed).toEqual([
      expect.objectContaining({ op: "patch", fields: { accountName: "새 이름" } }),
    ]);
  });

  it("throws when the server does not take the data", async () => {
    await saveLocal(accountItem(LOCAL, "로컬"));
    fakeSyncServer([], { pushStatus: 500 });

    await expect(uploadAllToCloud()).rejects.toThrow(/올리지 못했어요/);
  });
});

describe("downloadAllFromCloud", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    // biome-ignore lint/suspicious/noExplicitAny: 테스트 대역 — 전역·store 내부 API 에 접근한다.
    delete (globalThis as any).fetch;
  });

  it("keeps the device records and adds the cloud ones", async () => {
    await saveLocal(accountItem(LOCAL, "로컬"));
    fakeSyncServer([serverAccount(CLOUD, "클라우드")]);

    await downloadAllFromCloud();

    const records = await getRecordLayer().loadRecords();
    expect([...records.values()].map((r) => r.id).sort()).toEqual([LOCAL, CLOUD].sort());
    expect(window.localStorage.getItem(SYNC_STATE_KEY)).toBeNull();
  });

  it("refuses to switch while changes cannot be sent", async () => {
    fakeSyncServer([], { pushStatus: 500 });
    await getRecordLayer().applySync((_local, state) => ({
      state: {
        ...state,
        outbox: {
          [`account:${LOCAL}`]: {
            type: "account",
            id: LOCAL,
            op: "patch",
            parentId: null,
            fields: { note: "x" },
            seq: 1,
          },
        },
      },
      changes: [],
      result: undefined,
    }));

    await expect(downloadAllFromCloud()).rejects.toThrow(/보내지 못한 변경/);
  });
});

describe("account value history on a mode switch", () => {
  const ACCOUNT = "11111111-1111-4111-8111-111111111111";
  const snapshot = (date: string, totalValue: number) => ({
    accountId: ACCOUNT,
    date,
    stockValue: totalValue,
    cashValue: 0,
    totalValue,
    holdingCount: 1,
    missingPriceCount: 0,
    oldestPriceDate: date,
  });

  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    // biome-ignore lint/suspicious/noExplicitAny: 테스트 대역 — 전역·store 내부 API 에 접근한다.
    delete (globalThis as any).fetch;
  });

  it("uploads the device snapshots after the accounts", async () => {
    window.localStorage.setItem(
      "account-snapshot-storage",
      JSON.stringify({ state: { snapshots: [snapshot("2026-11-24", 1)] }, version: 1 })
    );
    const { calls } = fakeSyncServer();

    await uploadAllToCloud();

    const writes = calls.filter(
      (c) => c.url === "/api/account-snapshots" && c.init?.method === "POST"
    );
    expect(JSON.parse(String(writes[0]!.init?.body))).toEqual({
      snapshots: [snapshot("2026-11-24", 1)],
    });
  });

  it("merges the server snapshots into the device when switching to local", async () => {
    window.localStorage.setItem(
      "account-snapshot-storage",
      JSON.stringify({ state: { snapshots: [snapshot("2026-11-24", 1)] }, version: 1 })
    );
    mockFetch((call) =>
      call.url === "/api/account-snapshots"
        ? jsonResponse({ snapshots: [snapshot("2026-11-23", 9), snapshot("2026-11-24", 9)] })
        : jsonResponse({ protocol: 2, records: [], cursor: "c", hasMore: false, reset: false })
    );

    await downloadAllFromCloud();

    const stored = JSON.parse(window.localStorage.getItem("account-snapshot-storage") ?? "null");
    expect(stored.state.snapshots.map((s: { totalValue: number }) => s.totalValue)).toEqual([9, 1]);
  });

  it("fails the switch when the snapshots cannot be downloaded", async () => {
    mockFetch((call) =>
      call.url === "/api/account-snapshots"
        ? jsonResponse({}, 500)
        : jsonResponse({ protocol: 2, records: [], cursor: "c", hasMore: false, reset: false })
    );

    await expect(downloadAllFromCloud()).rejects.toThrow(/계좌 총액 기록/);
  });
});
