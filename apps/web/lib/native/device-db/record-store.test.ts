// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { SCHEMA_VERSION } from "@seedbook/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { canonicalStringify, sha256Hex } from "./canonical-json";
import { migrateDeviceDatabase } from "./migrations";
import {
  HISTORY_PER_RECORD,
  readQuarantine,
  readRecords,
  type WriteContext,
  writeRecords,
} from "./record-store";
import { createNodeSqliteDriver } from "./testing/node-sqlite-driver";

const ACCOUNT_ID = "a1b2c3d4-0000-4000-8000-000000000001";
const HOLDING_ID = "a1b2c3d4-0000-4000-8000-000000000002";
const context: WriteContext = { writtenBy: "test@1" };

const accountFields = {
  accountName: "연금저축",
  accountType: "연금",
  currency: "KRW",
  initialInvestment: 1_000_000,
  currentValue: 1_200_000,
  note: "",
  color: "#00aa00",
  portfolioId: null,
};

type Driver = ReturnType<typeof createNodeSqliteDriver>;
let driver: Driver;

beforeEach(async () => {
  driver = createNodeSqliteDriver();
  await migrateDeviceDatabase(driver);
});

const putAccount = (fields: Record<string, unknown>, extra?: Record<string, unknown>) =>
  writeRecords(
    driver,
    [{ op: "put", type: "account", id: ACCOUNT_ID, sortKey: "a0", fields, extra }],
    context
  );

async function rawRow(type = "account", id = ACCOUNT_ID) {
  const [row] = await driver.query<Record<string, unknown> | undefined>(
    "SELECT * FROM records WHERE type = ? AND id = ?",
    [type, id]
  );
  return row;
}

async function readAccount() {
  const { records } = await readRecords(driver, { types: ["account"] });
  return records.find((r) => r.id === ACCOUNT_ID);
}

describe("writeRecords", () => {
  it("stores canonical JSON with its checksum, schema version and writer", async () => {
    await putAccount(accountFields);

    const row = (await rawRow()) ?? {};
    expect(row.data).toBe(canonicalStringify(accountFields));
    expect(row.checksum).toBe(await sha256Hex(row.data as string));
    expect(row.schemaVersion).toBe(SCHEMA_VERSION);
    expect(row.writtenBy).toBe("test@1");
    expect(row.sortKey).toBe("a0");
  });

  it("reads back what it wrote", async () => {
    await putAccount(accountFields);

    expect((await readAccount())?.data).toEqual(accountFields);
  });

  it("changes only the fields it is given (patch)", async () => {
    await putAccount(accountFields);

    await putAccount({ note: "메모" });

    expect((await readAccount())?.data).toEqual({ ...accountFields, note: "메모" });
  });

  it("keeps fields the definition does not know (a newer app's fields)", async () => {
    await putAccount(accountFields, { futureField: { nested: [1, 2] } });

    await putAccount({ ...accountFields, accountName: "ISA" });

    expect((await readAccount())?.data).toMatchObject({
      accountName: "ISA",
      futureField: { nested: [1, 2] },
    });
  });

  it("fills create-time defaults for a new record", async () => {
    const { note: _note, portfolioId: _portfolioId, ...required } = accountFields;

    await putAccount(required);

    expect((await readAccount())?.data).toMatchObject({ note: "", portfolioId: null });
  });

  it("does not write a rejected field and quarantines its value, keeping the stored one", async () => {
    await putAccount(accountFields);

    const outcome = await putAccount({ accountName: 42, note: "바뀜" });

    expect((await readAccount())?.data).toEqual({ ...accountFields, note: "바뀜" });
    expect(outcome.quarantined).toEqual([
      expect.objectContaining({ field: "accountName", code: "type", value: "42" }),
    ]);
    expect(await readQuarantine(driver)).toEqual([
      expect.objectContaining({ type: "account", id: ACCOUNT_ID, field: "accountName" }),
    ]);
  });

  it("does not create a half record when a required field is missing", async () => {
    const outcome = await putAccount({ accountName: "이름만" });

    expect(await rawRow()).toBeUndefined();
    expect(outcome.quarantined).toContainEqual(
      expect.objectContaining({ field: "*", code: "incomplete" })
    );
  });

  it("quarantines a value that JSON would silently change (NaN) instead of writing null", async () => {
    await putAccount(accountFields);

    const outcome = await putAccount({ note: "x" }, { legacyRate: Number.NaN });

    expect((await readAccount())?.data).toEqual(accountFields);
    expect(outcome.quarantined).toEqual([
      expect.objectContaining({ field: "legacyRate", code: "serialize" }),
    ]);
  });

  it("normalizes a NaN money field by the definition (finiteOrZero) rather than rejecting", async () => {
    await putAccount({ ...accountFields, currentValue: Number.NaN });

    expect((await readAccount())?.data.currentValue).toBe(0);
  });

  it("writes nothing when the record did not change", async () => {
    await putAccount(accountFields);
    const before = await rawRow();

    const outcome = await putAccount(accountFields);

    expect(outcome).toMatchObject({ written: 0, unchanged: 1 });
    expect(await rawRow()).toEqual(before);
    expect(await driver.query("SELECT * FROM records_history")).toHaveLength(0);
  });

  it(`keeps the last ${HISTORY_PER_RECORD} previous values per record`, async () => {
    for (let i = 0; i < 6; i += 1) await putAccount({ ...accountFields, note: `v${i}` });

    const history = await driver.query<{ data: string }>(
      "SELECT data FROM records_history WHERE id = ? ORDER BY seq",
      [ACCOUNT_ID]
    );
    expect(history.map((h) => JSON.parse(h.data).note)).toEqual(["v2", "v3", "v4"]);
  });

  it("deletes by tombstone: the row and its data stay, reads skip it", async () => {
    await putAccount(accountFields);

    await writeRecords(driver, [{ op: "delete", type: "account", id: ACCOUNT_ID }], context);

    expect(await readAccount()).toBeUndefined();
    expect((await rawRow())?.deletedAt).toEqual(expect.any(String));
    const { records } = await readRecords(driver, { types: ["account"], includeDeleted: true });
    expect(records[0]?.data).toEqual(accountFields);
  });

  it("revives a tombstone when the record is written again", async () => {
    await putAccount(accountFields);
    await writeRecords(driver, [{ op: "delete", type: "account", id: ACCOUNT_ID }], context);

    await putAccount(accountFields);

    expect((await readAccount())?.data).toEqual(accountFields);
  });

  it("writes everything in one transaction", async () => {
    const failing = {
      ...driver,
      batch: async () => {
        throw new Error("disk full");
      },
    };

    await expect(
      writeRecords(
        failing,
        [
          { op: "put", type: "account", id: ACCOUNT_ID, fields: accountFields },
          {
            op: "put",
            type: "holding",
            id: HOLDING_ID,
            parentId: ACCOUNT_ID,
            fields: { market: "", ticker: "", name: "x", currency: "", quantity: 1 },
          },
        ],
        context
      )
    ).rejects.toThrow("disk full");
    expect(await driver.query("SELECT * FROM records")).toHaveLength(0);
  });

  it("stores records of a type it does not know as they are", async () => {
    await writeRecords(
      driver,
      [{ op: "put", type: "futureType", id: "x1", fields: { anything: [1, "a"] } }],
      context
    );

    const { records } = await readRecords(driver, { types: ["futureType"] });
    expect(records[0]?.data).toEqual({ anything: [1, "a"] });
  });
});

describe("readRecords", () => {
  async function tamper(data: string, checksum?: string) {
    await driver.batch([
      {
        sql: "UPDATE records SET data = ?, checksum = ? WHERE id = ?",
        params: [data, checksum ?? (await sha256Hex(data)), ACCOUNT_ID],
      },
    ]);
  }

  it("quarantines a row whose checksum does not match and recovers the last good value from history", async () => {
    await putAccount(accountFields);
    await putAccount({ note: "최신" });
    const [stored] = await driver.query<{ checksum: string }>(
      "SELECT checksum FROM records WHERE id = ?",
      [ACCOUNT_ID]
    );
    const checksum = stored?.checksum;
    await tamper(canonicalStringify({ ...accountFields, note: "변조" }), checksum);

    const { records, quarantined } = await readRecords(driver, { types: ["account"] });

    expect(records[0]?.data).toEqual(accountFields);
    expect(quarantined).toEqual([expect.objectContaining({ code: "checksum", source: "read" })]);
    expect(await rawRow()).toBeDefined();
    expect(await readQuarantine(driver)).toEqual([
      expect.objectContaining({ code: "checksum", value: expect.stringContaining("변조") }),
    ]);
  });

  it("quarantines a row that no longer passes the definition", async () => {
    await putAccount(accountFields);
    await putAccount({ note: "2" });
    await tamper(canonicalStringify({ ...accountFields, accountName: 7 }));

    const { records, quarantined } = await readRecords(driver, { types: ["account"] });

    expect(quarantined[0]?.code).toBe("invalid");
    expect(records[0]?.data).toEqual(accountFields);
  });

  it("quarantines a row written by a newer schema version", async () => {
    await putAccount(accountFields);
    await driver.batch([
      { sql: "UPDATE records SET schemaVersion = ?", params: [SCHEMA_VERSION + 1] },
    ]);

    const { records, quarantined } = await readRecords(driver, { types: ["account"] });

    expect(quarantined[0]?.code).toBe("schema");
    expect(records).toEqual([]);
    expect(await rawRow()).toBeDefined();
  });

  it("leaves a broken row in place when there is no history to recover from", async () => {
    await putAccount(accountFields);
    await tamper('{"accountName":', "0".repeat(64)).catch(() => undefined);
    await driver.batch([{ sql: "UPDATE records SET checksum = ?", params: ["0".repeat(64)] }]);

    const { records } = await readRecords(driver, { types: ["account"] });

    expect(records).toEqual([]);
    expect(await driver.query("SELECT * FROM records")).toHaveLength(1);
  });

  it("orders records by sortKey", async () => {
    await writeRecords(
      driver,
      ["c", "a", "b"].map((sortKey, i) => ({
        op: "put" as const,
        type: "cash",
        id: `a1b2c3d4-0000-4000-8000-00000000001${i}`,
        parentId: ACCOUNT_ID,
        sortKey,
        fields: { label: sortKey, amount: 1 },
      })),
      context
    );

    const { records } = await readRecords(driver, { types: ["cash"] });

    expect(records.map((r) => r.data.label)).toEqual(["a", "b", "c"]);
  });
});

describe("SQLite constraints (independent of the JS checks)", () => {
  const insert = (data: string, checksum: string) =>
    driver.batch([
      {
        sql: `INSERT INTO records (type, id, data, checksum, schemaVersion, writtenBy, createdAt, updatedAt)
              VALUES ('account', 'x', ?, ?, 1, 't', 'now', 'now')`,
        params: [data, checksum],
      },
    ]);

  it("rejects broken JSON", async () => {
    await expect(insert('{"a":', "a".repeat(64))).rejects.toThrow(/CHECK constraint failed/);
  });

  it("rejects a checksum that is not 64 hex characters", async () => {
    await expect(insert("{}", "abc")).rejects.toThrow(/CHECK constraint failed/);
    await expect(insert("{}", "Z".repeat(64))).rejects.toThrow(/CHECK constraint failed/);
  });

  it("rejects a missing data value", async () => {
    await expect(
      driver.batch([
        {
          sql: `INSERT INTO records (type, id, data, checksum, schemaVersion, writtenBy, createdAt, updatedAt)
                VALUES ('account', 'x', NULL, ?, 1, 't', 'now', 'now')`,
          params: ["a".repeat(64)],
        },
      ])
    ).rejects.toThrow(/NOT NULL constraint failed/);
  });
});

describe("single write path", () => {
  const ROOT = join(__dirname, "../../..");
  const ALLOWED = new Set([
    "lib/native/device-db/record-store.ts",
    // 스냅샷 파일(별도 데이터베이스)의 records 표를 채운다 — 본 데이터베이스가 아니다.
    "lib/native/device-db/capacitor-driver.ts",
  ]);

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      if (name === "node_modules" || name.startsWith(".")) return [];
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });
  }

  it("only record-store.ts writes to the records tables", () => {
    const offenders = sourceFiles(ROOT)
      .filter((path) => !ALLOWED.has(relative(ROOT, path)))
      .filter((path) =>
        /(INSERT\s+(OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM)\s+records(_history)?\b/i.test(
          readFileSync(path, "utf8")
        )
      )
      .map((path) => relative(ROOT, path));

    expect(offenders).toEqual([]);
  });
});
