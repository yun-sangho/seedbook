import { describe, expect, it } from "vitest";
import { isValidSortKey, sortKeysAfter } from "./sort-key";

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
