// @vitest-environment node
import { RECORDS } from "@seedbook/domain";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { RECORD_TABLES } from "./record-tables";

describe("RECORD_TABLES", () => {
  it("maps every record type to its server table", () => {
    expect([...RECORD_TABLES.keys()]).toEqual(RECORDS.map((r) => r.type));
  });

  it("links each child record to its parent", () => {
    const children = Object.fromEntries(
      [...RECORD_TABLES.values()].map((t) => [
        t.definition.type,
        t.children.map((c) => c.definition.type),
      ])
    );

    expect(children).toMatchObject({
      account: ["holding", "cash", "accountRecord"],
      portfolio: ["allocation"],
      rebalancing: ["rebalancingTask"],
    });
  });

  it.each([...RECORD_TABLES.values()].map((t) => [t.definition.type, t] as const))(
    "%s can insert a row: every NOT NULL column without a DB default is written by the repo",
    (_, t) => {
      const written = new Set([
        t.key.name,
        "userId",
        "version",
        "changeSeq",
        "updatedAt",
        ...(t.parent ? [t.parent.name] : []),
        ...(t.sortKey ? ["sortKey"] : []),
        ...t.fields.map((f) => f.name),
        ...Object.keys(t.legacyInsert),
      ]);
      const unwritten = getTableConfig(t.table)
        .columns.filter((c) => c.notNull && !c.hasDefault && !written.has(c.name))
        .map((c) => c.name);

      expect(unwritten).toEqual([]);
    }
  );
});

describe("RECORD_TABLES selection", () => {
  it("reads only the definition's fields and the common sync columns (no legacy columns)", () => {
    const rebalancing = RECORD_TABLES.get("rebalancing");
    const account = RECORD_TABLES.get("account");

    expect(Object.keys(rebalancing?.selection ?? {})).not.toContain("tasks");
    expect(Object.keys(account?.selection ?? {})).not.toContain("sellCostPercent");
    expect(Object.keys(account?.selection ?? {})).toEqual(
      expect.arrayContaining(["id", "userId", "version", "changeSeq", "deletedAt", "sortKey"])
    );
  });
});
