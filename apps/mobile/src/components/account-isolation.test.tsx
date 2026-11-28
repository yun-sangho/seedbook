import type { InvestmentItem } from "@mobile/features/investments/types/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 한 기기에서 로그인 계정이 바뀔 때 앞사람 데이터가 다음 사람에게 보이거나, 합쳐지거나,
 * 올라가지 않는지 본다. 페이지를 열 때마다 모듈을 새로 불러와 실제 새로고침처럼 만들고,
 * 서버(세션 쿠키로 사용자를 가린다)만 가짜를 쓴다.
 */

// `resetModules` 뒤에도 SEED 는 실제 모듈을 한 번만 쓴다 (mock 결과는 초기화되지 않는다). 그러지 않으면
// 페이지를 열 때마다 앱과 무관한 모듈 수백 개를 다시 불러와, CPU 가 바쁠 때 제한 시간을 넘긴다.
vi.mock("@seed-design/react", (importOriginal) => importOriginal());

// `openPage` 가 페이지마다 다시 불러올 모듈을 미리 한 번 불러 둔다. 그러지 않으면 화면 전체의 첫 로딩
// (대부분 변환)이 첫 테스트의 5초 제한 안에서 돌아, CPU 가 바쁠 때 시간을 넘긴다. 시간을 넘긴 테스트는
// 멈추지 않고 뒤에서 이어져 다음 테스트와 act() 가 겹치고, 나머지 테스트도 함께 실패한다.
vi.mock("@mobile/lib/auth-client", () => ({ authClient: {}, useSession: () => PENDING }));
await import("./hydration-gate");
await import("./auth-gate");
await import("@mobile/features/investments/stores/investment-store");

type SessionState = {
  data: { user: { id: string; name: string; image: string } } | null;
  isPending: boolean;
};

// 씨앗 아바타를 정한 계정 — 가입 단계(`ProfileSetupGate`)를 지난 상태.
const session = (userId: string): SessionState => ({
  data: { user: { id: userId, name: "푸른 새싹", image: "seed:sprout-2-green" } },
  isPending: false,
});
const SIGNED_OUT: SessionState = { data: null, isPending: false };
const PENDING: SessionState = { data: null, isPending: true };

const IDS: Record<string, string> = {
  "A의 계좌": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "B의 계좌": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "새 계좌": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
};

function account(accountName: string): InvestmentItem {
  return {
    id: IDS[accountName] as string,
    accountName,
    accountType: "일반 투자 계좌",
    currency: "KRW",
    initialInvestment: 0,
    currentValue: 0,
    records: [],
    holdings: [],
    cashItems: [],
    note: "",
    color: "#000000",
  };
}

/**
 * 계정 표시가 생기기 전 버전이 기기 기본 자리에 남긴 자산 레코드 (`seedbook.records`, 접두사 없음).
 */
async function seedBaseSlotRecords(...names: string[]) {
  const { createKvRecordStore } = await import("@mobile/lib/sync/v2/device-record-store");
  const store = createKvRecordStore(
    {
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
    },
    "seedbook.records"
  );
  await store.apply(
    names.map((name) => {
      const { id, records: _r, holdings: _h, cashItems: _c, ...fields } = account(name);
      return { op: "put" as const, type: "account", id, parentId: null, sortKey: null, fields };
    })
  );
}

/** 사용자별 데이터를 가진 서버. `cookie` 는 지금 브라우저의 세션 쿠키가 가리키는 사용자. */
function fakeServer() {
  const users = new Map<string, { mode: "local" | "cloud"; accounts: Map<string, unknown> }>();
  const userOf = (id: string) => {
    const found = users.get(id) ?? { mode: "local" as const, accounts: new Map() };
    users.set(id, found);
    return found;
  };
  const state = { cookie: null as string | null };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? "GET";
    // 서버의 resolveUserId 와 같은 규칙: 요청한 계정이 세션과 다르면 401.
    const expected = new Headers(init?.headers).get("x-seedbook-account");
    if (!state.cookie || (expected && expected !== state.cookie)) return json({}, 401);
    const user = userOf(state.cookie);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (url.startsWith("/api/me/storage-mode")) {
      if (method === "PUT") user.mode = body.storageMode;
      return json({ storageMode: user.mode, chosen: true, inUse: true });
    }
    if (url.startsWith("/api/me/preferences")) return json({});
    if (url.startsWith("/api/me/consents")) return json({ agreed: true });
    if (url.startsWith("/api/storage/investment-storage")) {
      if (method === "PUT") {
        user.accounts = new Map(body.data.state.investments.map((i: { id: string }) => [i.id, i]));
        return json({ ok: true });
      }
      return json({ data: { state: { investments: [...user.accounts.values()] }, version: 4 } });
    }
    if (url.startsWith("/api/storage/")) return json({ data: null });
    if (url.startsWith("/api/sync/v2/pull")) {
      return json({
        protocol: 2,
        records: [...user.accounts].map(([id, data], i) => {
          const { id: _id, records, holdings, cashItems, ...fields } = data as InvestmentItem;
          return {
            type: "account",
            id,
            parentId: null,
            version: 1,
            changeSeq: String(i + 1),
            deletedAt: null,
            sortKey: null,
            fields: { portfolioId: null, ...fields },
          };
        }),
        cursor: "c",
        hasMore: false,
        reset: false,
      });
    }
    if (url.startsWith("/api/sync/v2/push")) {
      for (const op of body.ops) {
        if (op.type !== "account" || op.op === "delete") continue;
        user.accounts.set(op.id, {
          id: op.id,
          ...(user.accounts.get(op.id) as object),
          ...op.fields,
        });
      }
      return json({
        results: body.ops.map(() => ({ status: "ok", version: 2, changeSeq: "1" })),
      });
    }
    return json({}, 404);
  };

  const names = (id: string) =>
    [...userOf(id).accounts.values()].map((a) => (a as InvestmentItem).accountName);
  return { state, fetch, userOf, names };
}

let server: ReturnType<typeof fakeServer>;
let reload: ReturnType<typeof vi.fn>;
let closePage: (() => void) | null = null;

type InvestmentStore =
  typeof import("@mobile/features/investments/stores/investment-store").useInvestmentStore;

function Accounts({ useStore }: { useStore: InvestmentStore }) {
  const accounts = useStore((s) => s.investments);
  return <div data-testid="app">{accounts.map((a) => a.accountName).join(",")}</div>;
}

/** 페이지 하나를 새로 연다 (탭·새로고침마다 store 메모리가 따로다). */
async function openPage(initial: SessionState) {
  vi.resetModules();
  let current = initial;
  const listeners = new Set<() => void>();
  vi.doMock("@mobile/lib/auth-client", async () => {
    const { useSyncExternalStore } = await import("react");
    return {
      authClient: {},
      useSession: () =>
        useSyncExternalStore(
          (l) => {
            listeners.add(l);
            return () => listeners.delete(l);
          },
          () => current
        ),
    };
  });
  const { act, cleanup, render } = await import("@testing-library/react");
  const { StrictMode } = await import("react");
  const { HydrationGate } = await import("./hydration-gate");
  const { AuthGate } = await import("./auth-gate");
  const { useInvestmentStore } = await import(
    "@mobile/features/investments/stores/investment-store"
  );
  const view = render(
    <StrictMode>
      <HydrationGate>
        <AuthGate>
          <Accounts useStore={useInvestmentStore} />
        </AuthGate>
      </HydrationGate>
    </StrictMode>
  );
  const settle = () =>
    act(async () => {
      for (let i = 0; i < 20; i += 1) await new Promise((r) => setTimeout(r, 0));
    });
  await settle();
  const page = {
    store: useInvestmentStore,
    settle,
    /** 화면에 보이는 계좌 (앱이 안 보이면 null). */
    shown: () => view.queryByTestId("app")?.textContent ?? null,
    text: () => view.container.textContent ?? "",
    changeSession: async (next: SessionState) => {
      act(() => {
        current = next;
        listeners.forEach((l) => l());
      });
    },
    add: async (name: string) => {
      // 저장(persist)이 비동기라 act 안에서 끝까지 기다린다.
      await act(async () => {
        useInvestmentStore.setState((s) => ({ investments: [...s.investments, account(name)] }));
      });
      await settle();
    },
    focus: async () => {
      window.dispatchEvent(new Event("focus"));
      await settle();
    },
    close: () => cleanup(),
  };
  closePage = page.close;
  return page;
}

/** 로그인한 사용자로 페이지를 열고, 앱이 새로고침을 부르면 따라간다. */
async function openAs(userId: string) {
  closePage?.();
  server.state.cookie = userId;
  reload.mockClear();
  let page = await openPage(session(userId));
  for (let i = 0; i < 3 && reload.mock.calls.length > 0; i += 1) {
    page.close();
    reload.mockClear();
    page = await openPage(session(userId));
  }
  return page;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("seedbook.localIdUpgraded.v1", "1");
  server = fakeServer();
  reload = vi.fn();
  vi.stubGlobal("fetch", server.fetch);
  vi.stubGlobal("location", {
    reload,
    href: "",
    pathname: "/home",
    search: "",
  } as unknown as Location);
});

afterEach(() => {
  closePage?.();
  closePage = null;
  vi.doUnmock("@mobile/lib/auth-client");
  vi.unstubAllGlobals();
});

describe("switching accounts on one device", () => {
  it("does not upload a local account's data to the next account's cloud", async () => {
    const a = await openAs("user-a");
    await a.add("A의 계좌");
    server.userOf("user-b").mode = "cloud";

    const b = await openAs("user-b");

    expect(b.shown()).toBe("");
    expect(server.names("user-b")).toEqual([]);
  });

  it("does not show a local account's data to the next local account", async () => {
    const a = await openAs("user-a");
    await a.add("A의 계좌");

    const b = await openAs("user-b");

    expect(b.shown()).toBe("");
  });

  it("does not merge a cloud account's cache into the next local account", async () => {
    server.userOf("user-a").mode = "cloud";
    const a = await openAs("user-a");
    await a.add("A의 계좌");

    const b = await openAs("user-b");

    expect(b.shown()).toBe("");
  });

  it("shows the first account's data again when it comes back", async () => {
    const a = await openAs("user-a");
    await a.add("A의 계좌");
    const b = await openAs("user-b");
    await b.add("B의 계좌");

    const aAgain = await openAs("user-a");
    expect(aAgain.shown()).toBe("A의 계좌");
    const bAgain = await openAs("user-b");
    expect(bAgain.shown()).toBe("B의 계좌");
  });

  it("keeps each account's unsent sync queue to itself and sends it when the owner returns", async () => {
    server.userOf("user-a").mode = "cloud";
    server.userOf("user-b").mode = "cloud";
    const a = await openAs("user-a");
    server.state.cookie = null; // 세션이 끊겨 보내지 못한 채 남은 변경
    await a.add("A의 계좌");

    const b = await openAs("user-b");
    await b.settle();
    expect(server.names("user-b")).toEqual([]);

    const aAgain = await openAs("user-a");
    await vi.waitFor(() => expect(server.names("user-a")).toEqual(["A의 계좌"]));
    expect(aAgain.shown()).toBe("A의 계좌");
  });

  it("keeps the storage mode per account", async () => {
    server.userOf("user-a").mode = "cloud";
    await openAs("user-a");
    const b = await openAs("user-b");
    await b.add("B의 계좌");
    await b.settle();

    expect(server.names("user-b")).toEqual([]);
    expect(server.userOf("user-b").mode).toBe("local");
  });
});

describe("before the session is known", () => {
  it("does not hydrate any account's data while the session is loading", async () => {
    await seedBaseSlotRecords("A의 계좌");
    const page = await openPage(PENDING);

    expect(page.store.getState().investments).toEqual([]);
    expect(page.shown()).toBeNull();
  });

  it("shows the login screen without loading data when signed out", async () => {
    await seedBaseSlotRecords("A의 계좌");
    const saved = localStorage.getItem("seedbook.records");
    const page = await openPage(SIGNED_OUT);

    expect(page.text()).toContain("타 서비스의 정보는");
    expect(page.store.getState().investments).toEqual([]);
    expect(localStorage.getItem("seedbook.records")).toBe(saved);
  });

  it("loads the account's data once the pending session resolves", async () => {
    const a = await openAs("user-a");
    await a.add("A의 계좌");
    a.close();
    const page = await openPage(PENDING);

    await page.changeSession(session("user-a"));
    await page.settle();

    expect(page.shown()).toBe("A의 계좌");
  });

  it("reloads when someone signs in on a page that started signed out", async () => {
    const page = await openPage(SIGNED_OUT);

    await page.changeSession(session("user-a"));
    await page.settle();

    expect(page.shown()).toBeNull();
    expect(reload).toHaveBeenCalled();
  });
});

describe("an account change while a page is open", () => {
  it("hides the previous account's memory at once and reloads", async () => {
    const a = await openAs("user-a");
    await a.add("A의 계좌");

    server.state.cookie = "user-b";
    await a.changeSession(session("user-b"));

    expect(a.shown()).toBeNull();
    await a.settle();
    expect(reload).toHaveBeenCalled();
  });

  it("does not send a stale tab's edits with the new account's cookie", async () => {
    server.userOf("user-a").mode = "cloud";
    server.userOf("user-b").mode = "cloud";
    const staleTab = await openAs("user-a");
    closePage = null;
    server.state.cookie = "user-b"; // 다른 탭에서 B 로 로그인했고 이 탭은 아직 모른다

    await staleTab.add("새 계좌");
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise((r) => setTimeout(r, 1_200));
    await staleTab.settle();

    expect(server.names("user-b")).toEqual([]);
    staleTab.close();
  });

  it("does not pull the new account's data into a stale tab", async () => {
    server.userOf("user-a").mode = "cloud";
    server.userOf("user-b").accounts.set(IDS["B의 계좌"] as string, account("B의 계좌"));
    const staleTab = await openAs("user-a");
    server.state.cookie = "user-b";

    await staleTab.focus();

    expect(staleTab.shown()).toBe("");
  });

  it("does not let a stale local tab write into the new account's data", async () => {
    const staleTab = await openAs("user-a");
    closePage = null;
    const b = await openAs("user-b");
    await b.add("B의 계좌");

    staleTab.store.setState({ investments: [account("새 계좌")] });

    const bAgain = await openAs("user-b");
    expect(bAgain.shown()).toBe("B의 계좌");
  });
});

describe("device data saved before ownership was tracked", () => {
  it("stays visible to the first account that signs in after the update", async () => {
    await seedBaseSlotRecords("A의 계좌");

    const a = await openAs("user-a");

    expect(a.shown()).toBe("A의 계좌");
  });

  it("belongs to the account recorded in the sync queue, not to whoever signs in first", async () => {
    await seedBaseSlotRecords("A의 계좌");
    localStorage.setItem(
      "seedbook.sync.investment",
      JSON.stringify({
        userId: "user-a",
        meta: { cursor: null, versions: {}, outbox: {}, pendingOrder: null, seq: 0 },
      })
    );

    const b = await openAs("user-b");
    expect(b.shown()).toBe("");

    const a = await openAs("user-a");
    expect(a.shown()).toBe("A의 계좌");
  });
});

describe("switching the storage mode within one account", () => {
  it("still merges this device's data into the same account's cloud", async () => {
    const a = await openAs("user-a");
    await a.add("A의 계좌");
    server.userOf("user-a").mode = "cloud";
    server.userOf("user-a").accounts.set(IDS["새 계좌"] as string, account("새 계좌"));

    const again = await openAs("user-a");

    expect(server.names("user-a").sort()).toEqual(["A의 계좌", "새 계좌"]);
    expect(again.shown()?.split(",").sort()).toEqual(["A의 계좌", "새 계좌"]);
  });
});
