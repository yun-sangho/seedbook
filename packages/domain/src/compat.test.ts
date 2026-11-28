import { describe, expect, it } from "vitest";
import { checkSchema, classifyChanges } from "./compat";
import { defineRecord, type RecordFields } from "./define-record";
import { f, shape } from "./fields";
import { createSnapshot } from "./snapshot";

const snapshotOf = (fields: RecordFields, version = 1, minSchema = 1, sortable = false) =>
  createSnapshot(
    [defineRecord({ type: "item", table: "item", key: { kind: "uuid" }, sortable, fields })],
    { schemaVersion: version, minSchema }
  );

const kindsOf = (before: RecordFields, after: RecordFields) =>
  classifyChanges(snapshotOf(before), snapshotOf(after)).map((c) => c.kind);

describe("classifyChanges", () => {
  it("finds nothing when the definitions are the same", () => {
    expect(kindsOf({ a: f.text() }, { a: f.text() })).toEqual([]);
  });

  it("treats adding a field with a default as an extension", () => {
    expect(kindsOf({}, { a: f.text({ default: "" }) })).toEqual(["extension"]);
  });

  it("treats adding a nullable field with a null default as an extension", () => {
    expect(kindsOf({}, { a: f.money({ nullable: true, default: null }) })).toEqual(["extension"]);
  });

  it("treats adding a field without a default as breaking", () => {
    expect(kindsOf({}, { a: f.text() })).toEqual(["breaking"]);
  });

  it("treats removing a field as breaking", () => {
    expect(kindsOf({ a: f.text() }, {})).toEqual(["breaking"]);
  });

  it("treats changing a field's type as breaking", () => {
    expect(kindsOf({ a: f.text() }, { a: f.int() })).toEqual(["breaking"]);
  });

  it("treats adding a value to an open enum as an extension", () => {
    expect(kindsOf({ a: f.enum(["x"]) }, { a: f.enum(["x", "y"]) })).toEqual(["extension"]);
  });

  it("treats adding a value to a closed enum as breaking", () => {
    const before = { a: f.enum(["x"], { open: false }) };
    const after = { a: f.enum(["x", "y"], { open: false }) };

    expect(kindsOf(before, after)).toEqual(["breaking"]);
  });

  it("treats removing an enum value as breaking", () => {
    expect(kindsOf({ a: f.enum(["x", "y"]) }, { a: f.enum(["x"]) })).toEqual(["breaking"]);
  });

  it("treats raising min as breaking", () => {
    expect(kindsOf({ a: f.int({ min: 0 }) }, { a: f.int({ min: 1 }) })).toEqual(["breaking"]);
  });

  it("treats raising min as an extension when the field clamps", () => {
    const before = { a: f.int({ min: 0, normalize: ["clamp"] }) };
    const after = { a: f.int({ min: 1, normalize: ["clamp"] }) };

    expect(kindsOf(before, after)).toEqual(["extension"]);
  });

  it("treats loosening max as an extension", () => {
    expect(kindsOf({ a: f.int({ max: 4 }) }, { a: f.int({ max: 5 }) })).toEqual(["extension"]);
  });

  it("treats forbidding null as breaking", () => {
    const before = { a: f.text({ nullable: true, default: null }) };

    expect(kindsOf(before, { a: f.text({ default: "" }) })).toContain("breaking");
  });

  it("treats removing a default as breaking", () => {
    expect(kindsOf({ a: f.text({ default: "" }) }, { a: f.text() })).toEqual(["breaking"]);
  });

  it("treats removing a normalize rule as breaking", () => {
    const before = { a: f.decimal({ normalize: ["finiteOrZero"] }) };

    expect(kindsOf(before, { a: f.decimal() })).toEqual(["breaking"]);
  });

  it("treats marking a field deprecated as an extension", () => {
    expect(kindsOf({ a: f.text() }, { a: f.text({ deprecated: true }) })).toEqual(["extension"]);
  });

  it("looks inside json shapes", () => {
    const before = { a: f.json(shape.object({ x: f.int() })) };
    const added = { a: f.json(shape.object({ x: f.int(), y: f.int({ default: 0 }) })) };
    const removed = { a: f.json(shape.object({})) };

    expect(kindsOf(before, added)).toEqual(["extension"]);
    expect(kindsOf(before, removed)).toEqual(["breaking"]);
  });

  it("treats a lower maxItems as breaking", () => {
    const before = { a: f.json(shape.list(f.int(), { maxItems: 4 })) };
    const after = { a: f.json(shape.list(f.int(), { maxItems: 3 })) };

    expect(kindsOf(before, after)).toEqual(["breaking"]);
  });

  it("treats adding a record type as an extension and removing one as breaking", () => {
    const one = snapshotOf({});
    const none = createSnapshot([], { schemaVersion: 1, minSchema: 1 });

    expect(classifyChanges(none, one).map((c) => c.kind)).toEqual(["extension"]);
    expect(classifyChanges(one, none).map((c) => c.kind)).toEqual(["breaking"]);
  });

  it("treats adding sortKey as an extension and removing it as breaking", () => {
    const plain = snapshotOf({}, 1, 1, false);
    const sorted = snapshotOf({}, 1, 1, true);

    expect(classifyChanges(plain, sorted).map((c) => c.kind)).toEqual(["extension"]);
    expect(classifyChanges(sorted, plain).map((c) => c.kind)).toEqual(["breaking"]);
  });
});

describe("checkSchema", () => {
  const v1 = snapshotOf({ a: f.text() }, 1, 1);

  it("passes before the first release (no snapshots)", () => {
    expect(checkSchema(snapshotOf({ a: f.text() }), []).errors).toEqual([]);
  });

  it("passes when nothing changed since the released snapshot", () => {
    expect(checkSchema(snapshotOf({ a: f.text() }, 1, 1), [v1]).errors).toEqual([]);
  });

  it("fails when the definitions changed but SCHEMA_VERSION did not", () => {
    const current = snapshotOf({ a: f.text(), b: f.text({ default: "" }) }, 1, 1);

    expect(checkSchema(current, [v1]).errors).toHaveLength(1);
  });

  it("passes an extension with a raised SCHEMA_VERSION", () => {
    const current = snapshotOf({ a: f.text(), b: f.text({ default: "" }) }, 2, 1);

    const result = checkSchema(current, [v1]);

    expect(result.errors).toEqual([]);
    expect(result.changes.map((c) => c.kind)).toEqual(["extension"]);
  });

  it("fails a breaking change when MIN_SCHEMA still lets the old app in", () => {
    const current = snapshotOf({}, 2, 1);

    expect(checkSchema(current, [v1]).errors).toHaveLength(1);
  });

  it("passes a breaking change when MIN_SCHEMA blocks the old app", () => {
    const current = snapshotOf({}, 2, 2);

    expect(checkSchema(current, [v1]).errors).toEqual([]);
  });

  it("checks every supported snapshot, not only the latest", () => {
    const v2 = snapshotOf({}, 2, 2);
    // v2 다시 a 를 기본값 없이 넣는다 — v2 앱이 a 없이 만든 레코드가 무효가 된다.
    const current = snapshotOf({ a: f.text() }, 3, 2);

    expect(checkSchema(current, [v1, v2]).errors).toHaveLength(1);
  });

  it("fails when SCHEMA_VERSION goes below the latest snapshot", () => {
    expect(
      checkSchema(snapshotOf({ a: f.text() }, 1, 1), [snapshotOf({ a: f.text() }, 2, 1)]).errors
    ).not.toEqual([]);
  });

  it("fails when MIN_SCHEMA goes down", () => {
    const v2 = snapshotOf({ a: f.text() }, 2, 2);

    expect(checkSchema(snapshotOf({ a: f.text() }, 2, 1), [v2]).errors).toHaveLength(1);
  });

  it("fails when MIN_SCHEMA is above SCHEMA_VERSION", () => {
    expect(checkSchema(snapshotOf({}, 1, 2), []).errors).toHaveLength(1);
  });
});
