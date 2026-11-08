import { describe, expect, it } from "vitest";
import {
  applyMutationResults,
  applyRemoteEntities,
  buildMutations,
  emptySyncMeta,
  mergePull,
  recordLocalChange,
  type SyncMeta,
} from "./entity-sync-core";

type Item = { id: string; name: string; amount: number };
const toData = (item: Item) => ({ name: item.name, amount: item.amount });
const fromData = (id: string, data: Record<string, unknown>) => ({ id, ...data }) as Item;
const item = (id: string, name = id, amount = 0): Item => ({ id, name, amount });

function metaWith(partial: Partial<SyncMeta>): SyncMeta {
  return { ...emptySyncMeta(), ...partial };
}

describe("recordLocalChange", () => {
  it("queues an upsert for a new item and an order change", () => {
    const meta = recordLocalChange(emptySyncMeta(), [], [item("a")], toData);

    expect(meta.outbox.a).toMatchObject({ op: "upsert", data: { name: "a", amount: 0 } });
    expect(meta.pendingOrder?.order).toEqual(["a"]);
  });

  it("queues an upsert only for items whose data changed", () => {
    const prev = [item("a"), item("b")];
    const next = [item("a"), item("b", "renamed")];

    const meta = recordLocalChange(emptySyncMeta(), prev, next, toData);

    expect(Object.keys(meta.outbox)).toEqual(["b"]);
    expect(meta.pendingOrder).toBeNull();
  });

  it("queues a delete for a removed item the server knows about", () => {
    const meta = recordLocalChange(
      metaWith({ versions: { a: 3 } }),
      [item("a"), item("b")],
      [item("b")],
      toData
    );

    expect(meta.outbox.a).toMatchObject({ op: "delete" });
    expect(meta.pendingOrder?.order).toEqual(["b"]);
  });

  it("drops a never-sent new item that is deleted before it was sent", () => {
    const added = recordLocalChange(emptySyncMeta(), [], [item("a")], toData);

    const meta = recordLocalChange(added, [item("a")], [], toData);

    expect(meta.outbox.a).toBeUndefined();
  });

  it("keeps only the latest pending change per item", () => {
    const first = recordLocalChange(
      metaWith({ versions: { a: 1 } }),
      [item("a")],
      [item("a", "x")],
      toData
    );

    const meta = recordLocalChange(first, [item("a", "x")], [item("a", "y")], toData);

    expect(meta.outbox.a).toMatchObject({ op: "upsert", data: { name: "y" } });
  });

  it("queues an order change when items are reordered", () => {
    const meta = recordLocalChange(
      emptySyncMeta(),
      [item("a"), item("b")],
      [item("b"), item("a")],
      toData
    );

    expect(Object.keys(meta.outbox)).toEqual([]);
    expect(meta.pendingOrder?.order).toEqual(["b", "a"]);
  });
});

describe("buildMutations", () => {
  it("uses the last seen server version as baseVersion (0 for new)", () => {
    const meta = recordLocalChange(
      metaWith({ versions: { a: 4 } }),
      [item("a")],
      [item("a", "edited"), item("b")],
      toData
    );

    const { mutations } = buildMutations(meta, "debt", "debts");

    expect(mutations).toEqual([
      {
        entity: "debt",
        op: "upsert",
        id: "a",
        baseVersion: 4,
        data: { name: "edited", amount: 0 },
      },
      { entity: "debt", op: "upsert", id: "b", baseVersion: 0, data: { name: "b", amount: 0 } },
      { entity: "listOrder", op: "set", domain: "debts", order: ["a", "b"] },
    ]);
  });

  it("returns nothing when there is nothing pending", () => {
    expect(buildMutations(emptySyncMeta(), "debt", "debts").mutations).toEqual([]);
  });
});

describe("applyMutationResults", () => {
  function sendOne(meta: SyncMeta) {
    return buildMutations(meta, "debt", "debts");
  }

  it("records the new version and clears the pending entry on ok", () => {
    const meta = recordLocalChange(emptySyncMeta(), [], [item("a")], toData);
    const { sent } = sendOne(meta);

    const result = applyMutationResults(meta, sent, [
      { status: "ok", version: 1 },
      { status: "ok" },
    ]);

    expect(result.meta.versions.a).toBe(1);
    expect(result.meta.outbox).toEqual({});
    expect(result.meta.pendingOrder).toBeNull();
    expect(result.remote).toEqual([]);
  });

  it("keeps an entry that changed while its request was in flight, with the new base version", () => {
    const meta = recordLocalChange(
      metaWith({ versions: { a: 1 } }),
      [item("a")],
      [item("a", "x")],
      toData
    );
    const { sent } = sendOne(meta);
    const changedMeanwhile = recordLocalChange(meta, [item("a", "x")], [item("a", "y")], toData);

    const result = applyMutationResults(changedMeanwhile, sent, [{ status: "ok", version: 2 }]);

    expect(result.meta.versions.a).toBe(2);
    expect(result.meta.outbox.a).toMatchObject({ op: "upsert", data: { name: "y" } });
  });

  it("lets the server win on conflict and returns its row to apply locally", () => {
    const meta = recordLocalChange(
      metaWith({ versions: { a: 1 } }),
      [item("a")],
      [item("a", "mine")],
      toData
    );
    const { sent } = sendOne(meta);
    const current = { id: "a", version: 2, deletedAt: null, data: { name: "theirs", amount: 0 } };

    const result = applyMutationResults(meta, sent, [{ status: "conflict", current }]);

    expect(result.meta.versions.a).toBe(2);
    expect(result.meta.outbox.a).toBeUndefined();
    expect(result.remote).toEqual([current]);
  });

  it("treats a conflict whose server data equals what was sent as success (retried request)", () => {
    const meta = recordLocalChange(
      metaWith({ versions: { a: 1 } }),
      [item("a")],
      [item("a", "same")],
      toData
    );
    const { sent } = sendOne(meta);
    const current = { id: "a", version: 2, deletedAt: null, data: { name: "same", amount: 0 } };

    const result = applyMutationResults(meta, sent, [{ status: "conflict", current }]);

    expect(result.meta.versions.a).toBe(2);
    expect(result.remote).toEqual([]);
  });

  it("drops a rejected mutation", () => {
    const meta = recordLocalChange(emptySyncMeta(), [item("a")], [item("a", "bad")], toData);
    const { sent } = sendOne(meta);

    const result = applyMutationResults(meta, sent, [{ status: "rejected", reason: "invalid" }]);

    expect(result.meta.outbox).toEqual({});
  });
});

describe("mergePull", () => {
  it("adds and updates items that are newer than the known version", () => {
    const items = [item("a", "old")];
    const meta = metaWith({ versions: { a: 1 }, cursor: "c0" });

    const result = mergePull(
      items,
      meta,
      {
        cursor: "c1",
        entities: [
          { id: "a", version: 2, deletedAt: null, data: { name: "new", amount: 5 } },
          { id: "b", version: 1, deletedAt: null, data: { name: "b", amount: 0 } },
        ],
        order: null,
      },
      fromData
    );

    expect(result.items).toEqual([item("a", "new", 5), item("b")]);
    expect(result.meta.versions).toEqual({ a: 2, b: 1 });
    expect(result.meta.cursor).toBe("c1");
  });

  it("removes tombstoned items", () => {
    const result = mergePull(
      [item("a"), item("b")],
      metaWith({ versions: { a: 1, b: 1 } }),
      {
        cursor: "c1",
        entities: [{ id: "a", version: 2, deletedAt: "2026-11-08T00:00:00.000Z", data: null }],
        order: null,
      },
      fromData
    );

    expect(result.items).toEqual([item("b")]);
    expect(result.meta.versions.a).toBe(2);
  });

  it("ignores rows it has already seen (overlap re-delivery)", () => {
    const result = mergePull(
      [item("a", "local")],
      metaWith({ versions: { a: 2 } }),
      {
        cursor: "c1",
        entities: [{ id: "a", version: 2, deletedAt: null, data: { name: "server", amount: 0 } }],
        order: null,
      },
      fromData
    );

    expect(result.items).toEqual([item("a", "local")]);
  });

  it("does not overwrite an item with a pending local change", () => {
    const meta = recordLocalChange(
      metaWith({ versions: { a: 1 } }),
      [item("a")],
      [item("a", "mine")],
      toData
    );

    const result = mergePull(
      [item("a", "mine")],
      meta,
      {
        cursor: "c1",
        entities: [{ id: "a", version: 2, deletedAt: null, data: { name: "theirs", amount: 0 } }],
        order: null,
      },
      fromData
    );

    expect(result.items).toEqual([item("a", "mine")]);
    expect(result.meta.outbox.a).toBeDefined();
  });

  it("applies the server order, keeping unknown items at the end", () => {
    const result = mergePull(
      [item("a"), item("b"), item("c")],
      emptySyncMeta(),
      {
        cursor: "c1",
        entities: [],
        order: ["c", "a"],
      },
      fromData
    );

    expect(result.items.map((i) => i.id)).toEqual(["c", "a", "b"]);
  });

  it("keeps the local order while a local order change is pending", () => {
    const meta = recordLocalChange(
      emptySyncMeta(),
      [item("a"), item("b")],
      [item("b"), item("a")],
      toData
    );

    const result = mergePull(
      [item("b"), item("a")],
      meta,
      {
        cursor: "c1",
        entities: [],
        order: ["a", "b"],
      },
      fromData
    );

    expect(result.items.map((i) => i.id)).toEqual(["b", "a"]);
  });
});

describe("applyRemoteEntities", () => {
  it("replaces, adds and removes items from server rows regardless of known versions", () => {
    const result = applyRemoteEntities(
      [item("a", "mine"), item("b")],
      [
        { id: "a", version: 2, deletedAt: null, data: { name: "theirs", amount: 0 } },
        { id: "b", version: 3, deletedAt: "2026-11-08T00:00:00.000Z", data: null },
        { id: "c", version: 1, deletedAt: null, data: { name: "c", amount: 0 } },
      ],
      fromData
    );

    expect(result).toEqual([item("a", "theirs"), item("c")]);
  });
});
