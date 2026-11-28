import { describe, expect, it } from "vitest";
import { assignListSortKeys, isValidSortKey, sortKeysAfter } from "./sort-key";

describe("sortKeysAfter", () => {
  it("starts a list from the first fractional index key", () => {
    expect(sortKeysAfter(null, 3)).toEqual(["a0", "a1", "a2"]);
  });

  it("appends keys that sort after the last existing key", () => {
    const keys = sortKeysAfter("a5", 2);

    expect(keys).toHaveLength(2);
    expect(["a5", ...keys]).toEqual(["a5", ...keys].sort());
    expect((keys[0] ?? "") > "a5").toBe(true);
  });

  it("keeps byte order for long lists", () => {
    const keys = sortKeysAfter(null, 200);

    expect(new Set(keys).size).toBe(200);
    expect([...keys].sort()).toEqual(keys);
  });

  it("returns nothing for an empty list", () => {
    expect(sortKeysAfter("a0", 0)).toEqual([]);
  });
});

describe("isValidSortKey", () => {
  it("accepts keys made by sortKeysAfter", () => {
    expect(sortKeysAfter(null, 3).every(isValidSortKey)).toBe(true);
  });

  it.each([
    ["", "empty"],
    ["zz~", "not a fractional index"],
    [42, "not a string"],
    ["a".repeat(300), "too long"],
  ])("rejects %j (%s)", (value, _reason) => {
    expect(isValidSortKey(value)).toBe(false);
  });
});

describe("assignListSortKeys", () => {
  const isSorted = (keys: string[]) => keys.every((k, i) => i === 0 || (keys[i - 1] ?? "") < k);

  it("keeps keys that are already in list order", () => {
    expect(assignListSortKeys(["a0", "a1", "a5"])).toEqual(["a0", "a1", "a5"]);
  });

  it("gives keys to new items between their neighbours", () => {
    const keys = assignListSortKeys(["a0", null, "a1", null]);

    expect(keys[0]).toBe("a0");
    expect(keys[2]).toBe("a1");
    expect(isSorted(keys)).toBe(true);
  });

  it("changes only the moved item when one item moves to the front", () => {
    const keys = assignListSortKeys(["a3", "a0", "a1", "a2"]);

    expect(keys.slice(1)).toEqual(["a0", "a1", "a2"]);
    expect(isSorted(keys)).toBe(true);
  });

  it("replaces keys that are not fractional index keys", () => {
    const keys = assignListSortKeys(["00000000", "00000001"]);

    expect(keys.every((k) => isValidSortKey(k))).toBe(true);
    expect(isSorted(keys)).toBe(true);
  });

  it("replaces duplicate keys", () => {
    const keys = assignListSortKeys(["a0", "a0", "a0"]);

    expect(new Set(keys).size).toBe(3);
    expect(isSorted(keys)).toBe(true);
  });

  it("returns nothing for an empty list", () => {
    expect(assignListSortKeys([])).toEqual([]);
  });
});
