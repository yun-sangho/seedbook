// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CanonicalJsonError, canonicalStringify, jsonEqual, sha256Hex } from "./canonical-json";

describe("canonicalStringify", () => {
  it("sorts object keys at every depth", () => {
    expect(canonicalStringify({ b: 1, a: { d: [{ z: 1, y: 2 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[{"y":2,"z":1}]},"b":1}'
    );
  });

  it("gives the same string regardless of key insertion order", () => {
    expect(canonicalStringify({ x: 1, y: "a" })).toBe(canonicalStringify({ y: "a", x: 1 }));
  });

  it.each([
    ["NaN", { amount: Number.NaN }],
    ["Infinity", { amount: Number.POSITIVE_INFINITY }],
    ["-Infinity", [Number.NEGATIVE_INFINITY]],
    ["undefined", { memo: undefined }],
    ["function", { fn: () => 1 }],
    ["bigint", { amount: 1n }],
    ["Date", { at: new Date(0) }],
    ["Map", { m: new Map() }],
  ])("throws on %s instead of silently changing it", (_, value) => {
    expect(() => canonicalStringify(value)).toThrow(CanonicalJsonError);
  });

  it("names the path of the bad value", () => {
    expect(() => canonicalStringify({ items: [{ quantity: Number.NaN }] })).toThrow(
      /items\[0\]\.quantity/
    );
  });

  it("writes -0 as 0", () => {
    expect(canonicalStringify({ v: -0 })).toBe('{"v":0}');
  });

  it.each([
    ["large safe integer", Number.MAX_SAFE_INTEGER],
    ["negative decimal", -1234.5678],
    ["emoji", "🌱 씨앗"],
    ["lone surrogate", "\ud800x"],
    ["control characters", 'line\nbreak\t"quote"\\'],
    ["empty containers", { a: [], b: {} }],
  ])("round-trips %s", (_, value) => {
    const text = canonicalStringify({ value });
    expect(jsonEqual(JSON.parse(text), { value })).toBe(true);
  });
});

describe("jsonEqual", () => {
  it("ignores key order", () => {
    expect(jsonEqual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
  });

  it("notices a missing key, a changed value and array order", () => {
    expect(jsonEqual({ a: 1 }, { a: 1, b: null })).toBe(false);
    expect(jsonEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(jsonEqual([1, 2], [2, 1])).toBe(false);
  });
});

describe("sha256Hex", () => {
  it("returns the 64-character hex digest", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("hashes UTF-8 bytes", async () => {
    expect(await sha256Hex("씨앗")).toHaveLength(64);
    expect(await sha256Hex("씨앗")).not.toBe(await sha256Hex("새싹"));
  });
});
