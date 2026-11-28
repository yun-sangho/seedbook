import { describe, expect, it } from "vitest";
import { defineRecord } from "./define-record";
import { f, shape } from "./fields";
import { parsePatch, WHOLE_RECORD } from "./parse-patch";

const item = defineRecord({
  type: "item",
  table: "item",
  key: { kind: "uuid" },
  fields: {
    name: f.text(),
    memo: f.text({ default: "", maxLength: 5 }),
    quantity: f.decimal({ normalize: ["finiteOrZero"] }),
    amount: f.money({ normalize: ["trunc"], min: 0 }),
    percent: f.decimal({ min: 0, max: 100, normalize: ["clamp"] }),
    stage: f.int({ min: 0, max: 4, default: 0 }),
    mode: f.enum(["a", "b"], { default: "a" }),
    closedMode: f.enum(["x"], { open: false, nullable: true, default: null }),
    sections: f.enumList(["p", "q"], { default: [] }),
    day: f.date({ nullable: true, default: null }),
    at: f.timestamp({ nullable: true, default: null }),
    ref: f.uuidRef({ nullable: true, default: null }),
    done: f.bool({ default: false }),
    history: f.json(
      shape.list(shape.object({ amount: f.money(), note: f.text({ default: "" }) }), {
        maxItems: 2,
      }),
      { default: [] }
    ),
  },
});

const create = (raw: unknown) => parsePatch(item, raw, { op: "create" });
const patch = (raw: unknown) => parsePatch(item, raw, { op: "patch" });

describe("parsePatch — patch", () => {
  it("keeps only the fields that were sent and never fills defaults", () => {
    const result = patch({ quantity: 3 });

    expect(result).toEqual({ patch: { quantity: 3 }, rejected: [] });
  });

  it("rejects only the invalid field and applies the rest", () => {
    const result = patch({ name: 42, quantity: 2 });

    expect(result.patch).toEqual({ quantity: 2 });
    expect(result.rejected).toEqual([{ field: "name", code: "type" }]);
  });

  it("ignores fields the definition does not know", () => {
    expect(patch({ futureField: 1 }).patch).toEqual({});
  });

  it("rejects a record that is not an object", () => {
    expect(patch([1, 2]).rejected).toEqual([{ field: WHOLE_RECORD, code: "type" }]);
  });

  it("treats an explicit null on a non-nullable field as a rejection, not a clear", () => {
    expect(patch({ name: null }).rejected).toEqual([{ field: "name", code: "null" }]);
  });

  it("accepts an explicit null on a nullable field", () => {
    expect(patch({ day: null }).patch).toEqual({ day: null });
  });
});

describe("parsePatch — create", () => {
  it("fills defaults for fields that were not sent", () => {
    const result = create({ name: "n", quantity: 1, amount: 10, percent: 5 });

    expect(result.rejected).toEqual([]);
    expect(result.patch).toMatchObject({
      memo: "",
      stage: 0,
      mode: "a",
      sections: [],
      done: false,
    });
  });

  it("reports missing fields that have no default as required", () => {
    const result = create({ name: "n" });

    expect(result.rejected).toEqual([
      { field: "quantity", code: "required" },
      { field: "amount", code: "required" },
      { field: "percent", code: "required" },
    ]);
  });

  it("falls back to the default when a field with a default is invalid", () => {
    const result = create({ name: "n", quantity: 1, amount: 1, percent: 1, stage: 9 });

    expect(result.rejected).toEqual([{ field: "stage", code: "max" }]);
    expect(result.patch.stage).toBe(0);
  });
});

describe("parsePatch — normalize", () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, null])(
    "turns %s into 0 with finiteOrZero",
    (v) => {
      expect(patch({ quantity: v }).patch).toEqual({ quantity: 0 });
    }
  );

  it("truncates money before checking it is an integer", () => {
    expect(patch({ amount: 12.9 }).patch).toEqual({ amount: 12 });
  });

  it("rejects money below its minimum", () => {
    expect(patch({ amount: -1 }).rejected).toEqual([{ field: "amount", code: "min" }]);
  });

  it("clamps into range instead of rejecting", () => {
    expect(patch({ percent: 120 }).patch).toEqual({ percent: 100 });
    expect(patch({ percent: -3 }).patch).toEqual({ percent: 0 });
  });
});

describe("parsePatch — kinds", () => {
  it("checks text length", () => {
    expect(patch({ memo: "toolong" }).rejected).toEqual([{ field: "memo", code: "length" }]);
  });

  it("rejects a non-integer int", () => {
    expect(patch({ stage: 1.5 }).rejected).toEqual([{ field: "stage", code: "type" }]);
  });

  it.each(["2026-02-30", "2026-1-01", "2026-01-01T00:00:00Z"])("rejects the date %s", (day) => {
    expect(patch({ day }).rejected).toEqual([{ field: "day", code: "type" }]);
  });

  it("accepts a valid date and timestamp", () => {
    expect(patch({ day: "2024-02-29", at: "2026-11-28T01:02:03.000Z" }).rejected).toEqual([]);
  });

  it("requires a uuid for uuidRef", () => {
    expect(patch({ ref: "abc" }).rejected).toEqual([{ field: "ref", code: "type" }]);
  });
});

describe("parsePatch — enums", () => {
  it("rejects an unknown value by default (server — always the newest definition)", () => {
    expect(patch({ mode: "c" }).rejected).toEqual([{ field: "mode", code: "enum" }]);
  });

  it("keeps an unknown value of an open enum when reading as an older app", () => {
    const result = parsePatch(item, { mode: "c" }, { op: "patch", enums: "open" });

    expect(result.patch).toEqual({ mode: "c" });
  });

  it("still rejects an unknown value of a closed enum when reading as an older app", () => {
    const result = parsePatch(item, { closedMode: "y" }, { op: "patch", enums: "open" });

    expect(result.rejected).toEqual([{ field: "closedMode", code: "enum" }]);
  });

  it("drops unknown and duplicate entries of an enum list", () => {
    expect(patch({ sections: ["p", "z", "p", "q"] }).patch).toEqual({ sections: ["p", "q"] });
  });
});

describe("parsePatch — json", () => {
  it("fills nested defaults and drops unknown nested keys", () => {
    const result = patch({ history: [{ amount: 5, extra: true }] });

    expect(result.patch).toEqual({ history: [{ amount: 5, note: "" }] });
  });

  it("keeps unknown nested keys when reading as an older app", () => {
    const result = parsePatch(
      item,
      { history: [{ amount: 5, extra: true }] },
      {
        op: "patch",
        enums: "open",
      }
    );

    expect(result.patch).toEqual({ history: [{ amount: 5, note: "", extra: true }] });
  });

  it("rejects the whole json field when an item is invalid", () => {
    expect(patch({ history: [{ amount: "x" }] }).rejected).toEqual([
      { field: "history", code: "shape" },
    ]);
  });

  it("rejects a list longer than maxItems", () => {
    const history = [{ amount: 1 }, { amount: 2 }, { amount: 3 }];

    expect(patch({ history }).rejected).toEqual([{ field: "history", code: "shape" }]);
  });
});

describe("parsePatch — derived keys", () => {
  const dated = defineRecord({
    type: "dated",
    table: "dated",
    parent: { type: "item", column: "itemId", onParentDelete: "tombstone" },
    key: { kind: "derived", namespace: "parent", name: "date" },
    fields: { date: f.date(), value: f.money() },
  });

  it("does not let a patch change the field the key is made from", () => {
    const result = parsePatch(dated, { date: "2026-01-01", value: 1 }, { op: "patch" });

    expect(result).toEqual({
      patch: { value: 1 },
      rejected: [{ field: "date", code: "immutable" }],
    });
  });

  it("accepts the key field when creating", () => {
    const result = parsePatch(dated, { date: "2026-01-01", value: 1 }, { op: "create" });

    expect(result).toEqual({ patch: { date: "2026-01-01", value: 1 }, rejected: [] });
  });
});
