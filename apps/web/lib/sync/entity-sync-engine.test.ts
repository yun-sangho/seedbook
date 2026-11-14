import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type EntitySyncHandle, startEntitySync } from "./entity-sync-engine";
import { recordPersistedChange } from "./local-change-recorder";
import type { ManagedStoreConfig } from "./managed-store-config";

type Item = { id: string; name: string };

const config: ManagedStoreConfig<Item> = {
  storageKey: "items-storage",
  entity: "debt",
  listOrderDomain: "debts",
  metaKey: "test.sync.items",
  persistVersion: 1,
  itemsField: "items",
  toData: (item) => ({ name: item.name }),
  fromData: (id, data) => ({ id, name: String(data.name) }),
};

/** Zustand 와 같은 모양의 아주 작은 store (subscribe 가 next / prev 를 넘긴다). */
function fakeStore(initial: Item[]) {
  let items = initial;
  const listeners = new Set<(next: Item[], prev: Item[]) => void>();
  return {
    get: () => items,
    set: (next: Item[]) => {
      const prev = items;
      items = next;
      listeners.forEach((l) => l(next, prev));
    },
    subscribe: (l: (next: Item[], prev: Item[]) => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

/** 사용자가 store 를 고친 상황 — 저장 어댑터가 하듯 바뀐 내용을 대기열에 기록한다. */
function editLocally(store: ReturnType<typeof fakeStore>, next: Item[]) {
  const envelope = (items: Item[]) => JSON.stringify({ state: { items }, version: 1 });
  const prev = store.get();
  store.set(next);
  recordPersistedChange(config, envelope(prev), envelope(next));
}

type Call = { url: string; body: unknown };

function fakeServer(handlers: {
  pull?: (since: string | null) => unknown;
  mutations?: (mutations: unknown[]) => unknown;
}) {
  const calls: Call[] = [];
  const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    if (url.startsWith("/api/sync/pull")) {
      const since = new URL(url, "http://x").searchParams.get("since");
      const payload = handlers.pull?.(since) ?? {
        cursor: since,
        changes: { debt: [], listOrder: [] },
      };
      return new Response(JSON.stringify(payload), { status: 200 });
    }
    const results = handlers.mutations?.(body.mutations) ?? [];
    return new Response(JSON.stringify({ results }), { status: 200 });
  });
  return { calls, fetchFn };
}

describe("startEntitySync", () => {
  let handle: EntitySyncHandle | null = null;

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    handle?.stop();
    handle = null;
  });

  it("pulls on start and applies server rows without echoing them back as mutations", async () => {
    const store = fakeStore([]);
    const server = fakeServer({
      pull: () => ({
        cursor: "c1",
        changes: {
          debt: [{ id: "a", version: 1, deletedAt: null, data: { name: "server" } }],
          listOrder: [{ domain: "debts", order: ["a"] }],
        },
      }),
    });

    handle = startEntitySync(config, store, { userId: "u1", fetchFn: server.fetchFn });
    await handle.pull();
    await handle.flush();

    expect(store.get()).toEqual([{ id: "a", name: "server" }]);
    expect(server.calls.filter((c) => c.url === "/api/sync/mutations")).toEqual([]);
  });

  it("sends only the changed item as an upsert", async () => {
    const store = fakeStore([]);
    const server = fakeServer({
      pull: () => ({
        cursor: "c1",
        changes: {
          debt: [
            { id: "a", version: 3, deletedAt: null, data: { name: "x" } },
            { id: "b", version: 1, deletedAt: null, data: { name: "y" } },
          ],
          listOrder: [],
        },
      }),
      mutations: (ms) => ms.map(() => ({ status: "ok", version: 4 })),
    });
    handle = startEntitySync(config, store, { userId: "u1", fetchFn: server.fetchFn });
    await handle.pull();

    editLocally(store, [
      { id: "a", name: "edited" },
      { id: "b", name: "y" },
    ]);
    await handle.flush();

    const sent = server.calls.find((c) => c.url === "/api/sync/mutations")?.body as {
      mutations: unknown[];
    };
    expect(sent.mutations).toEqual([
      { entity: "debt", op: "upsert", id: "a", data: { name: "edited" } },
    ]);
  });

  it("restores the server state with a full pull after a rejected change", async () => {
    const store = fakeStore([]);
    const server = fakeServer({
      pull: () => ({
        cursor: "c2",
        changes: {
          debt: [{ id: "a", version: 1, deletedAt: null, data: { name: "server" } }],
          listOrder: [],
        },
      }),
      mutations: () => [{ status: "rejected", reason: "invalid" }],
    });
    handle = startEntitySync(config, store, { userId: "u1", fetchFn: server.fetchFn });
    await handle.pull();

    editLocally(store, [{ id: "a", name: "not accepted" }]);
    await handle.flush();

    expect(store.get()).toEqual([{ id: "a", name: "server" }]);
    const pulls = server.calls.filter((c) => c.url.startsWith("/api/sync/pull"));
    expect(pulls.at(-1)?.url).toBe("/api/sync/pull");
  });

  it("keeps pending changes across a restart (offline queue)", async () => {
    const store = fakeStore([]);
    const offline = vi.fn(async () => {
      throw new TypeError("network down");
    });
    handle = startEntitySync(config, store, { userId: "u1", fetchFn: offline });
    editLocally(store, [{ id: "a", name: "made offline" }]);
    await handle.flush();
    handle.stop();

    const server = fakeServer({ mutations: (ms) => ms.map(() => ({ status: "ok", version: 1 })) });
    handle = startEntitySync(config, store, { userId: "u1", fetchFn: server.fetchFn });
    await handle.flush();

    const sent = server.calls.find((c) => c.url === "/api/sync/mutations")?.body as {
      mutations: Array<{ id?: string; op: string }>;
    };
    expect(sent.mutations).toContainEqual(
      expect.objectContaining({ op: "upsert", id: "a", data: { name: "made offline" } })
    );
  });

  it("keeps a queue recorded before the user was known and sends it for the signed-in user", async () => {
    localStorage.setItem(
      config.metaKey,
      JSON.stringify({
        userId: "",
        meta: {
          cursor: null,
          versions: {},
          outbox: { a: { op: "upsert", data: { name: "before login" }, seq: 1 } },
          pendingOrder: null,
          seq: 1,
        },
      })
    );
    const server = fakeServer({ mutations: (ms) => ms.map(() => ({ status: "ok", version: 1 })) });
    handle = startEntitySync(config, fakeStore([]), { userId: "u1", fetchFn: server.fetchFn });

    await handle.flush();

    const sent = server.calls.find((c) => c.url === "/api/sync/mutations")?.body as {
      mutations: Array<{ id: string }>;
    };
    expect(sent.mutations).toContainEqual(expect.objectContaining({ id: "a" }));
  });

  it("shares one request when several stores pull with the same cursor at once", async () => {
    const otherConfig = { ...config, metaKey: "test.sync.other", storageKey: "other-storage" };
    const server = fakeServer({
      pull: () => ({ cursor: "c1", changes: { debt: [], listOrder: [] } }),
    });
    const a = startEntitySync(config, fakeStore([]), { userId: "u1", fetchFn: server.fetchFn });
    const b = startEntitySync(otherConfig, fakeStore([]), {
      userId: "u1",
      fetchFn: server.fetchFn,
    });

    await Promise.all([a.pull(), b.pull()]);
    a.stop();
    b.stop();

    expect(server.calls.filter((c) => c.url.startsWith("/api/sync/pull"))).toHaveLength(1);
  });

  it("drops another user's pending queue and reloads everything from the server", async () => {
    const store = fakeStore([]);
    const offline = vi.fn(async () => {
      throw new TypeError("network down");
    });
    handle = startEntitySync(config, store, { userId: "u1", fetchFn: offline });
    editLocally(store, [{ id: "a", name: "u1 data" }]);
    await handle.flush();
    handle.stop();

    const server = fakeServer({
      pull: (since) => ({ cursor: "c9", changes: { debt: [], listOrder: [] }, since }),
      mutations: (ms) => ms.map(() => ({ status: "ok", version: 1 })),
    });
    handle = startEntitySync(config, store, { userId: "u2", fetchFn: server.fetchFn });
    await handle.pull();
    await handle.flush();

    expect(server.calls[0]?.url).toBe("/api/sync/pull");
    expect(server.calls.some((c) => c.url === "/api/sync/mutations")).toBe(false);
    expect(store.get()).toEqual([]);
  });
});
