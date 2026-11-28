import { createHash, randomUUID } from "node:crypto";
import { schema } from "@seedbook/database";
import { openTestDb } from "@web/test/db/test-db";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  findLatestBundle,
  haltBundle,
  KEEP_RECENT_FILES,
  listBundles,
  promoteBundle,
  publishBundle,
  readBundleFile,
  recordBundleReport,
} from "./app-bundles";

const { db, close } = openTestDb();
afterAll(close);

/** 테스트마다 다른 접두사 — 같은 DB 를 쓰는 다른 테스트 파일과 섞이지 않게. */
let prefix = "";
beforeEach(async () => {
  prefix = `t${randomUUID().slice(0, 8)}`;
  // 이 테이블들은 사용자와 잇지 않아 cascade 로 지워지지 않는다 — 다른 실행이 남긴 것을 비운다.
  await db.delete(schema.appBundle).where(like(schema.appBundle.id, "t%"));
});

let clock = Date.parse("2026-11-28T00:00:00.000Z");
function tick(): Date {
  clock += 1000;
  return new Date(clock);
}

async function publish(
  name: string,
  { appVersion = "1.0.0", minNative = "1.0.0" }: { appVersion?: string; minNative?: string } = {}
) {
  const id = `${prefix}-${name}`;
  const data = Buffer.from(`zip of ${id}`);
  const result = await publishBundle(
    db,
    {
      id,
      appVersion,
      minNative,
      build: `sha-${name}`,
      checksum: createHash("sha256").update(data).digest("hex"),
      signature: "c2ln",
      data,
    },
    tick()
  );
  expect(result).toBe("published");
  return id;
}

const query = { native: "1.0.0", current: null, device: "device-a" } as const;

describe("publishing a bundle", () => {
  it("serves it to the beta channel right away", async () => {
    const id = await publish("a");

    const latest = await findLatestBundle(db, { ...query, channel: "beta" });

    expect(latest.bundle?.id).toBe(id);
  });

  it("does not serve it to production before it is promoted", async () => {
    await publish("a");

    const latest = await findLatestBundle(db, { ...query, channel: "production" });

    expect(latest).toEqual({ bundle: null, reset: false });
  });

  it("refuses a body whose SHA-256 is not the checksum", async () => {
    const result = await publishBundle(db, {
      id: `${prefix}-bad`,
      appVersion: "1.0.0",
      minNative: "1.0.0",
      build: "sha",
      checksum: "0".repeat(64),
      signature: "c2ln",
      data: Buffer.from("zip"),
    });

    expect(result).toBe("checksum_mismatch");
  });

  it("refuses the same id twice", async () => {
    const id = await publish("a");
    const data = Buffer.from("other");

    const result = await publishBundle(db, {
      id,
      appVersion: "1.0.0",
      minNative: "1.0.0",
      build: "sha",
      checksum: createHash("sha256").update(data).digest("hex"),
      signature: "c2ln",
      data,
    });

    expect(result).toBe("exists");
  });

  it("serves the zip bytes", async () => {
    const id = await publish("a");

    expect((await readBundleFile(db, id))?.toString()).toBe(`zip of ${id}`);
  });

  it("keeps only the recent bundle bodies", async () => {
    const first = await publish("first");
    for (let i = 0; i < KEEP_RECENT_FILES; i++) await publish(`n${i}`);

    expect(await readBundleFile(db, first)).toBeNull();
  });

  it("keeps the body of a promoted bundle that is still served", async () => {
    const first = await publish("first");
    await promoteBundle(db, first, 100, tick());
    for (let i = 0; i < KEEP_RECENT_FILES; i++) await publish(`n${i}`);

    expect(await readBundleFile(db, first)).not.toBeNull();
  });
});

describe("choosing the bundle for a device", () => {
  it("does not give a bundle to a binary older than its minNative", async () => {
    await publish("a", { appVersion: "1.1.0", minNative: "1.1.0" });

    const latest = await findLatestBundle(db, { ...query, channel: "beta" });

    expect(latest.bundle).toBeNull();
  });

  it("falls back to an older bundle that fits the binary", async () => {
    const old = await publish("old");
    await publish("new", { appVersion: "1.1.0", minNative: "1.1.0" });

    const latest = await findLatestBundle(db, { ...query, channel: "beta" });

    expect(latest.bundle?.id).toBe(old);
  });

  it("serves production the most recently promoted bundle", async () => {
    const a = await publish("a");
    const b = await publish("b");
    await promoteBundle(db, b, 100, tick());
    await promoteBundle(db, a, 100, tick());

    const latest = await findLatestBundle(db, { ...query, channel: "production" });

    expect(latest.bundle?.id).toBe(a);
  });

  it("keeps devices outside a 0% rollout on the previous production bundle", async () => {
    const a = await publish("a");
    await promoteBundle(db, a, 100, tick());
    const b = await publish("b");
    await promoteBundle(db, b, 0, tick());

    const latest = await findLatestBundle(db, { ...query, channel: "production" });

    expect(latest.bundle?.id).toBe(a);
  });

  it("does not serve a halted bundle", async () => {
    const a = await publish("a");
    await haltBundle(db, a, "broken", tick());

    const latest = await findLatestBundle(db, { ...query, channel: "beta" });

    expect(latest.bundle).toBeNull();
  });

  it("tells a device on a halted bundle to go back to the built-in bundle", async () => {
    const a = await publish("a");
    await haltBundle(db, a, "broken", tick());

    const latest = await findLatestBundle(db, { ...query, channel: "beta", current: a });

    expect(latest).toEqual({ bundle: null, reset: true });
  });

  it("does not reset a device whose bundle is fine", async () => {
    const a = await publish("a");
    await promoteBundle(db, a, 0, tick());

    const latest = await findLatestBundle(db, { ...query, channel: "production", current: a });

    expect(latest).toEqual({ bundle: null, reset: false });
  });

  it("does not serve the zip of a halted bundle", async () => {
    const a = await publish("a");
    await haltBundle(db, a, "broken", tick());

    expect(await readBundleFile(db, a)).toBeNull();
  });
});

describe("promotion", () => {
  it("refuses a halted bundle", async () => {
    const a = await publish("a");
    await haltBundle(db, a, "broken", tick());

    expect(await promoteBundle(db, a, 100, tick())).toBe("halted");
  });

  it("refuses an unknown bundle", async () => {
    expect(await promoteBundle(db, `${prefix}-nope`, 100, tick())).toBe("not_found");
  });
});

describe("reports from devices", () => {
  const report = (bundleId: string, n: number, outcome: "applied" | "rolled_back") =>
    recordBundleReport(db, { bundleId, installId: `device-${n}`, outcome }, tick());

  it("counts each device once per outcome", async () => {
    const a = await publish("a");
    await report(a, 1, "applied");
    await report(a, 1, "applied");

    const [summary] = await listBundles(db, 1);

    expect(summary?.reports.applied).toBe(1);
  });

  it("halts the bundle when rollbacks cross the threshold", async () => {
    const a = await publish("a");
    await report(a, 1, "applied");
    await report(a, 2, "rolled_back");
    await report(a, 3, "rolled_back");

    const result = await report(a, 4, "rolled_back");

    expect(result).toBe("halted");
    const [row] = await db
      .select({ haltedAt: schema.appBundle.haltedAt })
      .from(schema.appBundle)
      .where(eq(schema.appBundle.id, a));
    expect(row?.haltedAt).not.toBeNull();
  });

  it("does not halt on a few rollbacks among many successes", async () => {
    const a = await publish("a");
    for (let i = 0; i < 20; i++) await report(a, i, "applied");
    await report(a, 100, "rolled_back");
    await report(a, 101, "rolled_back");

    expect(await report(a, 102, "rolled_back")).toBe("recorded");
  });

  it("ignores a report for an unknown bundle", async () => {
    expect(
      await recordBundleReport(db, {
        bundleId: `${prefix}-gone`,
        installId: "device-1",
        outcome: "applied",
      })
    ).toBe("unknown");
  });
});
