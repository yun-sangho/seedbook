import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  downloadAllFromCloud,
  hasAnyLocalData,
  uploadAllToCloud,
  type MigrationProgress,
} from "./storage-migration";
import { CLOUD_STORE_KEYS } from "./storage-mode";

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = impl as any;
  return calls;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("hasAnyLocalData", () => {
  beforeEach(() => window.localStorage.clear());

  it("빈 localStorage 에선 false", () => {
    expect(hasAnyLocalData()).toBe(false);
  });

  it("아무 cloud key 라도 있으면 true", () => {
    window.localStorage.setItem("investment-storage", '{"state":{}}');
    expect(hasAnyLocalData()).toBe(true);
  });
});

describe("uploadAllToCloud", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).fetch;
  });

  it("로컬에 있는 key 만 순차적으로 PUT 한다", async () => {
    window.localStorage.setItem(
      "investment-storage",
      JSON.stringify({ state: { investments: [] }, version: 3 })
    );
    window.localStorage.setItem(
      "savings-storage",
      JSON.stringify({ state: { savings: [] }, version: 1 })
    );

    const calls = mockFetch(() => jsonResponse({ ok: true }));
    const progress: MigrationProgress[] = [];

    await uploadAllToCloud((p) => progress.push({ ...p }));

    // 2 개 key 만 PUT 이 나가야 한다
    const puts = calls.filter((c) => c.init?.method === "PUT");
    expect(puts).toHaveLength(2);
    expect(puts[0]!.url).toContain("investment-storage");
    expect(puts[1]!.url).toContain("savings-storage");

    // 나머지 4 개는 skipped phase 를 봤어야 한다
    const skipped = progress.filter((p) => p.phase === "skipped");
    expect(skipped).toHaveLength(CLOUD_STORE_KEYS.length - 2);
  });

  it("PUT 실패 시 에러를 throw 한다", async () => {
    window.localStorage.setItem(
      "investment-storage",
      JSON.stringify({ state: { investments: [] }, version: 3 })
    );
    mockFetch(() => jsonResponse({ error: "boom" }, 500));

    await expect(uploadAllToCloud()).rejects.toThrow(/업로드 실패/);
  });

  it("클라우드에만 있는 항목을 지우지 않고 로컬과 합쳐서 PUT 한다", async () => {
    window.localStorage.setItem(
      "debts-storage",
      JSON.stringify({ state: { debts: [{ id: "local", loanName: "로컬" }] }, version: 3 })
    );
    const calls = mockFetch((call) =>
      call.init?.method === "PUT"
        ? jsonResponse({ ok: true })
        : jsonResponse({
            data: { state: { debts: [{ id: "cloud", loanName: "클라우드" }] }, version: 2 },
          })
    );

    await uploadAllToCloud();

    const put = calls.find((c) => c.init?.method === "PUT" && c.url.includes("debts-storage"));
    const sent = JSON.parse(String(put!.init!.body)).data;
    expect(sent.state.debts.map((d: { id: string }) => d.id)).toEqual(["local", "cloud"]);
  });

  it("전환 뒤 이전 클라우드 세션의 동기화 대기열을 비운다", async () => {
    window.localStorage.setItem("seedbook.sync.debt", JSON.stringify({ userId: "u", meta: {} }));
    mockFetch(() => jsonResponse({ ok: true }));

    await uploadAllToCloud();

    expect(window.localStorage.getItem("seedbook.sync.debt")).toBeNull();
  });

  it("envelope 가 손상된 key 는 조용히 스킵한다", async () => {
    window.localStorage.setItem("investment-storage", "not-json");
    const calls = mockFetch(() => jsonResponse({ ok: true }));

    await uploadAllToCloud();

    // 손상된 key 는 PUT 되지 않는다
    const puts = calls.filter((c) => c.init?.method === "PUT");
    expect(puts).toHaveLength(0);
  });
});

describe("downloadAllFromCloud", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).fetch;
  });

  it("각 key 에 대해 GET 후 localStorage 에 기록한다", async () => {
    let counter = 0;
    mockFetch(() =>
      jsonResponse({
        data: { state: { foo: counter++ }, version: 1 },
        updatedAt: null,
      })
    );

    await downloadAllFromCloud();

    for (const key of CLOUD_STORE_KEYS) {
      const raw = window.localStorage.getItem(key);
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed.state).toBeDefined();
    }
  });

  it("클라우드에 데이터가 없어도 로컬 데이터는 지우지 않는다", async () => {
    const local = JSON.stringify({ state: { investments: [{ id: "a" }] }, version: 6 });
    window.localStorage.setItem("investment-storage", local);
    mockFetch(() => jsonResponse({ data: null, updatedAt: null }));

    await downloadAllFromCloud();

    expect(window.localStorage.getItem("investment-storage")).toBe(local);
  });

  it("로컬에만 있는 항목(아직 못 보낸 변경 포함)을 남기고 클라우드와 합친다", async () => {
    window.localStorage.setItem(
      "debts-storage",
      JSON.stringify({ state: { debts: [{ id: "unsent", loanName: "방금 입력" }] }, version: 3 })
    );
    mockFetch(() => jsonResponse({ data: { state: { debts: [{ id: "cloud" }] }, version: 2 } }));

    await downloadAllFromCloud();

    const merged = JSON.parse(window.localStorage.getItem("debts-storage")!);
    expect(merged.state.debts.map((d: { id: string }) => d.id)).toEqual(["unsent", "cloud"]);
  });

  it("로컬 모드로 바꾸면 동기화 대기열을 비운다 (다시 켰을 때 옛 변경을 재전송하지 않도록)", async () => {
    window.localStorage.setItem("seedbook.sync.debt", JSON.stringify({ userId: "u", meta: {} }));
    mockFetch(() => jsonResponse({ data: null }));

    await downloadAllFromCloud();

    expect(window.localStorage.getItem("seedbook.sync.debt")).toBeNull();
  });

  it("GET 실패 시 에러를 throw 한다", async () => {
    mockFetch(() => jsonResponse({ error: "nope" }, 500));

    await expect(downloadAllFromCloud()).rejects.toThrow(/다운로드 실패/);
  });
});
