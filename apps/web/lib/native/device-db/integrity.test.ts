// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { META_LAST_QUICK_CHECK, readMeta } from "./device-meta";
import {
  ensureDailySnapshot,
  runQuickCheck,
  SNAPSHOTS_TO_KEEP,
  snapshotName,
  takeSnapshot,
} from "./integrity";
import { DEVICE_MIGRATIONS, migrateDeviceDatabase } from "./migrations";
import { writeRecords } from "./record-store";
import type { SqlDriver } from "./sql-driver";
import { createMemorySnapshotStore } from "./testing/memory-snapshot-store";
import { createNodeSqliteDriver } from "./testing/node-sqlite-driver";

let driver: SqlDriver;

beforeEach(async () => {
  driver = createNodeSqliteDriver();
  await migrateDeviceDatabase(driver);
});

const putCash = (id: string, label: string) =>
  writeRecords(
    driver,
    [{ op: "put", type: "cash", id, parentId: "p", fields: { label, amount: 1 } }],
    { writtenBy: "test@1" }
  );

describe("runQuickCheck", () => {
  it("reports ok on a healthy database and records the result", async () => {
    expect(await runQuickCheck(driver)).toEqual({ ok: true, messages: ["ok"] });
    expect(JSON.parse((await readMeta(driver, META_LAST_QUICK_CHECK)) ?? "{}")).toMatchObject({
      ok: true,
    });
  });

  it("reports the problems SQLite finds", async () => {
    const broken: SqlDriver = {
      ...driver,
      query: async <T>(sql: string, params?: (string | number | null)[]) =>
        (sql.startsWith("PRAGMA quick_check")
          ? [{ quick_check: "row 3 missing from index x" }]
          : await driver.query(sql, params)) as T[],
    };
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(await runQuickCheck(broken)).toEqual({
      ok: false,
      messages: ["row 3 missing from index x"],
    });
  });

  it("does not throw when the check itself fails", async () => {
    const failing: SqlDriver = {
      ...driver,
      query: async () => {
        throw new Error("database disk image is malformed");
      },
    };
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(await runQuickCheck(failing)).toMatchObject({ ok: false });
  });
});

describe("snapshots", () => {
  it("copies every records row, tombstones included", async () => {
    const store = createMemorySnapshotStore();
    await putCash("c1", "예수금");
    await writeRecords(driver, [{ op: "delete", type: "cash", id: "c1" }], { writtenBy: "t" });
    await putCash("c2", "CMA");

    const name = await takeSnapshot(driver, store, "daily", new Date("2026-11-28T01:02:03Z"));

    expect(name).toBe("seedbooksnap20261128T010203daily");
    const rows = await store.read(name as string);
    expect(rows.map((r) => [r.id, r.deletedAt === null])).toEqual([
      ["c1", false],
      ["c2", true],
    ]);
    expect(rows[0]).toMatchObject({ type: "cash", checksum: expect.any(String) });
  });

  it(`keeps only the newest ${SNAPSHOTS_TO_KEEP}`, async () => {
    const store = createMemorySnapshotStore();
    for (let day = 1; day <= 10; day += 1) {
      await takeSnapshot(driver, store, "daily", new Date(Date.UTC(2026, 10, day)));
    }

    const names = (await store.list()).sort();
    expect(names).toHaveLength(SNAPSHOTS_TO_KEEP);
    expect(names[0]).toBe(snapshotName(new Date(Date.UTC(2026, 10, 4)), "daily"));
  });

  it("takes the daily snapshot once a day", async () => {
    const store = createMemorySnapshotStore();

    await ensureDailySnapshot(driver, store, new Date("2026-11-28T01:00:00Z"));
    await ensureDailySnapshot(driver, store, new Date("2026-11-28T23:00:00Z"));
    await ensureDailySnapshot(driver, store, new Date("2026-11-29T00:30:00Z"));

    expect(await store.list()).toHaveLength(2);
  });

  it("skips a database that has no records table yet", async () => {
    const fresh = createNodeSqliteDriver();

    expect(await takeSnapshot(fresh, createMemorySnapshotStore(), "migration")).toBeNull();
  });
});

describe("migrateDeviceDatabase beforeMigrate", () => {
  it("runs before pending versions on a database already in use", async () => {
    const db = createNodeSqliteDriver();
    await migrateDeviceDatabase(db, DEVICE_MIGRATIONS.slice(0, 6));
    const order: string[] = [];

    await migrateDeviceDatabase(db, DEVICE_MIGRATIONS, {
      beforeMigrate: async (pending) => {
        const tables = await db.query<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE name = 'records'"
        );
        order.push(`before ${pending.join(",")} records=${tables.length}`);
      },
    });

    expect(order).toEqual(["before 7 records=0"]);
  });

  it("does not run on a brand-new database or when nothing is pending", async () => {
    const beforeMigrate = vi.fn(async () => undefined);
    const db = createNodeSqliteDriver();

    await migrateDeviceDatabase(db, DEVICE_MIGRATIONS, { beforeMigrate });
    await migrateDeviceDatabase(db, DEVICE_MIGRATIONS, { beforeMigrate });

    expect(beforeMigrate).not.toHaveBeenCalled();
  });

  it("does not migrate when the snapshot fails", async () => {
    const db = createNodeSqliteDriver();
    await migrateDeviceDatabase(db, DEVICE_MIGRATIONS.slice(0, 6));

    await expect(
      migrateDeviceDatabase(db, DEVICE_MIGRATIONS, {
        beforeMigrate: async () => {
          throw new Error("no space");
        },
      })
    ).rejects.toThrow("no space");
    expect(await db.query("SELECT name FROM sqlite_master WHERE name = 'records'")).toEqual([]);
  });
});
