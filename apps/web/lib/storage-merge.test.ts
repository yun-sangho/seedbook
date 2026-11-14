import { describe, expect, it } from "vitest";
import { mergeEnvelopes } from "./storage-merge";

const env = (state: Record<string, unknown>, version: number) => ({ state, version });

describe("mergeEnvelopes", () => {
  it("keeps items that exist on only one side (nothing is dropped)", () => {
    const local = env({ investments: [{ id: "a", accountName: "local only" }] }, 3);
    const cloud = env({ investments: [{ id: "b", accountName: "cloud only" }] }, 3);

    const merged = mergeEnvelopes("investment-storage", local, cloud);

    expect(merged!.state.investments).toEqual([
      { id: "a", accountName: "local only" },
      { id: "b", accountName: "cloud only" },
    ]);
  });

  it("prefers the local copy when the same item exists on both sides", () => {
    const local = env({ investments: [{ id: "a", accountName: "edited locally" }] }, 3);
    const cloud = env({ investments: [{ id: "a", accountName: "older in cloud" }] }, 3);

    const merged = mergeEnvelopes("investment-storage", local, cloud);

    expect(merged!.state.investments).toEqual([{ id: "a", accountName: "edited locally" }]);
  });

  it("orders local items first, then cloud-only items in cloud order", () => {
    const local = env({ investments: [{ id: "b" }, { id: "a" }] }, 3);
    const cloud = env({ investments: [{ id: "c" }, { id: "a" }, { id: "d" }] }, 2);

    const merged = mergeEnvelopes("investment-storage", local, cloud);

    expect((merged!.state.investments as Array<{ id: string }>).map((s) => s.id)).toEqual([
      "b",
      "a",
      "c",
      "d",
    ]);
  });

  it("keeps local non-list fields and fills missing ones from the cloud", () => {
    const local = env({ investments: [], holdingsSortOption: "value" }, 6);
    const cloud = env({ investments: [], holdingsSortOption: "name", extra: 1 }, 4);

    const merged = mergeEnvelopes("investment-storage", local, cloud);

    expect(merged?.state).toMatchObject({ holdingsSortOption: "value", extra: 1 });
  });

  it("uses the lower version so the client migration covers items from both sides", () => {
    const merged = mergeEnvelopes(
      "investment-storage",
      env({ investments: [] }, 6),
      env({ investments: [] }, 4)
    );

    expect(merged?.version).toBe(4);
  });

  it("returns the other side when one side is missing", () => {
    const cloud = env({ investments: [{ id: "b" }] }, 2);

    expect(mergeEnvelopes("investment-storage", null, cloud)).toEqual(cloud);
    expect(mergeEnvelopes("investment-storage", cloud, null)).toEqual(cloud);
    expect(mergeEnvelopes("investment-storage", null, null)).toBeNull();
  });

  it("keeps each account in only one portfolio after merging", () => {
    const local = env(
      { portfolios: [{ id: "p1", accountIds: ["acc"], updatedAt: "2026-11-02T00:00:00.000Z" }] },
      3
    );
    const cloud = env(
      { portfolios: [{ id: "p2", accountIds: ["acc"], updatedAt: "2026-11-01T00:00:00.000Z" }] },
      3
    );

    const merged = mergeEnvelopes("portfolio-storage", local, cloud);

    expect(
      (merged!.state.portfolios as Array<{ id: string; accountIds: string[] }>).map((p) => [
        p.id,
        p.accountIds,
      ])
    ).toEqual([
      ["p1", ["acc"]],
      ["p2", []],
    ]);
  });
});
