import { beforeEach, describe, expect, it, vi } from "vitest";
import { onLocalChange, recordPersistedChange, withoutRecording } from "./local-change-recorder";
import type { ManagedStoreConfig } from "./managed-store-config";
import { readSyncMeta } from "./sync-meta-storage";

type Item = { id: string; name: string };

const config: ManagedStoreConfig<Item> = {
  storageKey: "items-storage",
  entity: "debt",
  listOrderDomain: "debts",
  metaKey: "test.sync.recorder",
  persistVersion: 1,
  itemsField: "items",
  toData: (item) => ({ name: item.name }),
  fromData: (id, data) => ({ id, name: String(data.name) }),
};

const envelope = (items: Item[]) => JSON.stringify({ state: { items }, version: 1 });

describe("recordPersistedChange", () => {
  beforeEach(() => localStorage.clear());

  it("queues the items that changed between two persisted states", () => {
    recordPersistedChange(
      config,
      envelope([
        { id: "a", name: "x" },
        { id: "b", name: "y" },
      ]),
      envelope([{ id: "a", name: "edited" }])
    );

    const meta = readSyncMeta(config.metaKey)!.meta;
    expect(meta.outbox.a).toMatchObject({ op: "upsert", data: { name: "edited" } });
    // b 는 서버가 모르는 항목이라 지울 것이 없다.
    expect(meta.outbox.b).toBeUndefined();
    expect(meta.pendingOrder?.order).toEqual(["a"]);
  });

  it("records changes even before anything is known about the user", () => {
    recordPersistedChange(config, null, envelope([{ id: "a", name: "x" }]));

    expect(readSyncMeta(config.metaKey)).toMatchObject({ userId: "", meta: { outbox: { a: {} } } });
  });

  it("ignores writes made while applying server changes", () => {
    withoutRecording(config.metaKey, () =>
      recordPersistedChange(config, envelope([]), envelope([{ id: "a", name: "from server" }]))
    );

    expect(readSyncMeta(config.metaKey)).toBeNull();
  });

  it("notifies listeners of the store whose data changed", () => {
    const listener = vi.fn();
    const unsubscribe = onLocalChange(config.metaKey, listener);

    recordPersistedChange(config, envelope([]), envelope([{ id: "a", name: "x" }]));
    unsubscribe();
    recordPersistedChange(config, envelope([]), envelope([{ id: "b", name: "y" }]));

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the persisted items did not change (e.g. only a UI field moved)", () => {
    const listener = vi.fn();
    onLocalChange(config.metaKey, listener);

    recordPersistedChange(
      config,
      JSON.stringify({ state: { items: [{ id: "a", name: "x" }], expanded: "" }, version: 1 }),
      JSON.stringify({ state: { items: [{ id: "a", name: "x" }], expanded: "a" }, version: 1 })
    );

    expect(listener).not.toHaveBeenCalled();
    expect(readSyncMeta(config.metaKey)).toBeNull();
  });
});
