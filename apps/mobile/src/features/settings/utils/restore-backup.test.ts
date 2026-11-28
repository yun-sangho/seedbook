import {
  ACCOUNT_A,
  envelope,
  investmentState,
  PORTFOLIO,
  portfolioState,
} from "@mobile/lib/native/device-db/testing/envelope-fixtures";
import { buildRecordBackup } from "@mobile/lib/sync/v2/backup";
import { applyChangesToMap } from "@mobile/lib/sync/v2/changes";
import type { RecordMap } from "@mobile/lib/sync/v2/records";
import { composeStore, INVESTMENT_STORE, PORTFOLIO_STORE } from "@mobile/lib/sync/v2/store-records";
import { memoryDevice } from "@mobile/lib/sync/v2/testing";
import { SCHEMA_VERSION } from "@seedbook/domain";
import { describe, expect, it } from "vitest";
import { backupAccountTag } from "./backup-ids";
import { planBackupImport, prepareBackupImport } from "./restore-backup";

const USER = "user-1";
const noOwnIds = async () => new Set<string>();

async function deviceWithData(): Promise<RecordMap> {
  const { layer } = memoryDevice({ cloud: false });
  await layer.saveStore(INVESTMENT_STORE, envelope(investmentState(), 6));
  await layer.saveStore(PORTFOLIO_STORE, envelope(portfolioState(), 3));
  return layer.loadRecords();
}

async function restore(raw: unknown, current: RecordMap = new Map()) {
  const prepared = await prepareBackupImport(raw, {
    userId: USER,
    current,
    fetchOwnIds: noOwnIds,
  });
  if (!prepared.ok) throw new Error(prepared.reason);
  return applyChangesToMap(current, planBackupImport(prepared.plan, current));
}

describe("backup import", () => {
  it("restores this account's record backup with ids and unknown fields as they were", async () => {
    const records = await deviceWithData();
    const key = `account:${ACCOUNT_A}`;
    const withUnknown = new Map(records);
    withUnknown.set(key, {
      ...(records.get(key) as NonNullable<ReturnType<typeof records.get>>),
      fields: { ...records.get(key)?.fields, futureField: "x" },
    });
    const file = JSON.parse(
      JSON.stringify(buildRecordBackup(withUnknown, await backupAccountTag(USER)))
    );

    const restored = await restore(file);

    expect(restored.get(key)?.fields.futureField).toBe("x");
    expect(composeStore(PORTFOLIO_STORE, restored).portfolios).toMatchObject([
      { id: PORTFOLIO, accountIds: [ACCOUNT_A] },
    ]);
  });

  it("refuses a backup from a newer app", async () => {
    const prepared = await prepareBackupImport(
      {
        format: "seedbook-backup",
        schemaVersion: SCHEMA_VERSION + 1,
        exportedAt: "2026-11-28T00:00:00.000Z",
        records: [],
      },
      { userId: USER, current: new Map(), fetchOwnIds: noOwnIds }
    );

    expect(prepared).toEqual({ ok: false, reason: "too_new" });
  });

  it("gives another account's backup new ids and keeps its links", async () => {
    const file = JSON.parse(
      JSON.stringify(buildRecordBackup(await deviceWithData(), "someone-else"))
    );

    const restored = await restore(file);

    const investments = composeStore(INVESTMENT_STORE, restored).investments as Array<{
      id: string;
    }>;
    expect(investments).toHaveLength(2);
    expect(investments.map((i) => i.id)).not.toContain(ACCOUNT_A);
    const [portfolio] = composeStore(PORTFOLIO_STORE, restored).portfolios as Array<{
      id: string;
      accountIds: string[];
    }>;
    expect(portfolio?.accountIds).toHaveLength(1);
    expect(investments.map((i) => i.id)).toContain(portfolio?.accountIds[0]);
  });

  it("turns a 2.0 backup into records through the store shape", async () => {
    const file = {
      version: "2.0",
      exportedAt: "2026-11-01T00:00:00.000Z",
      accountTag: await backupAccountTag(USER),
      ...{ investments: investmentState().investments },
      portfolios: portfolioState().portfolios,
      rebalancingSessions: [],
    };

    const restored = await restore(file);

    expect(composeStore(INVESTMENT_STORE, restored)).toEqual(investmentState());
    expect(composeStore(PORTFOLIO_STORE, restored).portfolios).toMatchObject([
      { id: PORTFOLIO, accountIds: [ACCOUNT_A] },
    ]);
  });

  it("leaves sections missing from an older backup untouched", async () => {
    const current = await deviceWithData();
    const file = {
      version: "1.0",
      exportedAt: "2026-01-01T00:00:00.000Z",
      accountTag: await backupAccountTag(USER),
      investments: [],
    };

    const restored = await restore(file, current);

    expect(composeStore(INVESTMENT_STORE, restored).investments).toEqual([]);
    expect(composeStore(PORTFOLIO_STORE, restored).portfolios).toHaveLength(1);
  });

  it("rejects a file that is not a Seedbook backup", async () => {
    const prepared = await prepareBackupImport(
      { hello: "world" },
      { userId: USER, current: new Map(), fetchOwnIds: noOwnIds }
    );

    expect(prepared).toEqual({ ok: false, reason: "invalid" });
  });
});
