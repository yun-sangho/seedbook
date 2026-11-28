import { describe, expect, it } from "vitest";
import { readReleasedSnapshots } from "../../scripts/snapshot-files";
import { deriveRecordId } from "../define-record";
import { parsePatch } from "../parse-patch";
import { sampleRecord } from "../samples";
import { createSnapshot } from "../snapshot";
import { validateDefinitions } from "../validate-definitions";
import { SCHEMA_VERSION } from "../version";
import {
  accountRecord,
  harvest,
  harvestId,
  PLANT_WISH_HISTORY_MAX,
  portfolio,
  RECORDS,
  rebalancingTask,
  recordTypesAt,
  settings,
} from "./index";

const ACCOUNT_ID = "0b5e4e8c-5f3a-4c7e-9a51-6f0f2d1e8a11";
const REBALANCING_ID = "4f9d2c1a-7b3e-4e2f-8a6d-1c5b9e7f3a20";

describe("record definitions", () => {
  it("defines the ten record types of the sync design", () => {
    expect(RECORDS.map((r) => r.type)).toEqual([
      "account",
      "holding",
      "cash",
      "accountRecord",
      "portfolio",
      "allocation",
      "rebalancing",
      "rebalancingTask",
      "harvest",
      "settings",
    ]);
  });

  it("has no definition mistakes", () => {
    expect(validateDefinitions(RECORDS)).toEqual([]);
  });

  it("can be described as a JSON snapshot", () => {
    const snapshot = createSnapshot(RECORDS, { schemaVersion: 1, minSchema: 1 });

    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it("creates every record type from defaults plus the required fields only", () => {
    // 기본값이 없는 필드 = 생성 때 필수. 정의를 바꿔 이 목록이 바뀌면 확장 규칙(§7.4)을 확인한다.
    const required = Object.fromEntries(
      RECORDS.map((r) => [r.type, parsePatch(r, {}, { op: "create" }).rejected.map((x) => x.field)])
    );

    expect(required).toEqual({
      account: [
        "accountName",
        "accountType",
        "currency",
        "initialInvestment",
        "currentValue",
        "color",
      ],
      holding: ["market", "ticker", "name", "currency", "quantity"],
      cash: ["label", "amount"],
      accountRecord: ["date", "initialInvestment", "currentValue"],
      portfolio: ["name", "color"],
      allocation: ["market", "ticker", "name", "currency", "targetPercent"],
      rebalancing: [
        "accountId",
        "accountName",
        "portfolioId",
        "portfolioName",
        "cashDelta",
        "startedAt",
      ],
      rebalancingTask: [
        "allocationId",
        "market",
        "ticker",
        "name",
        "action",
        "amount",
        "price",
        "quantity",
        "done",
      ],
      harvest: ["sourceId", "sourceName", "season", "plantKind", "goals", "harvestedAt"],
      settings: [],
    });
  });
});

describe("plant name and wish history", () => {
  const wishes = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      wish: `소원 ${i}`,
      at: "2026-11-28T00:00:00.000Z",
    }));

  it.each([portfolio, harvest])("keeps up to the cap of wishes on a %s", (definition) => {
    const result = parsePatch(
      definition,
      { wishHistory: wishes(PLANT_WISH_HISTORY_MAX) },
      { op: "patch" }
    );

    expect(result.rejected).toEqual([]);
  });

  it.each([portfolio, harvest])("rejects more wishes than the cap on a %s", (definition) => {
    const result = parsePatch(
      definition,
      { wishHistory: wishes(PLANT_WISH_HISTORY_MAX + 1) },
      {
        op: "patch",
      }
    );

    expect(result.rejected.map((r) => r.field)).toEqual(["wishHistory"]);
  });

  it.each([portfolio, harvest])(
    "creates a %s without a plant name or wish history",
    (definition) => {
      const { plantName: _name, wishHistory: _history, ...fields } = sampleRecord(definition);

      const result = parsePatch(definition, fields, { op: "create" });

      expect(result.patch).toMatchObject({ plantName: "", wishHistory: [] });
    }
  );
});

describe("recordTypesAt", () => {
  it.each(readReleasedSnapshots().map((s) => [s.schemaVersion, s] as const))(
    "lists the record types of released snapshot v%s",
    (version, snapshot) => {
      expect(recordTypesAt(version).sort()).toEqual(Object.keys(snapshot.records).sort());
    }
  );

  it("lists every record type at the current version", () => {
    expect(recordTypesAt(SCHEMA_VERSION)).toEqual(RECORDS.map((r) => r.type));
  });
});

describe("sampleRecord", () => {
  it.each(RECORDS.map((r) => [r.type, r] as const))("makes a valid %s", (_, definition) => {
    const sample = sampleRecord(definition);

    expect(parsePatch(definition, sample, { op: "create" })).toEqual({
      patch: sample,
      rejected: [],
    });
  });
});

describe("deriveRecordId", () => {
  it("gives the same account record id for the same account and date", () => {
    const a = deriveRecordId(accountRecord, {
      parentId: ACCOUNT_ID,
      fields: { date: "2026-11-28" },
    });
    const b = deriveRecordId(accountRecord, {
      parentId: ACCOUNT_ID,
      fields: { date: "2026-11-28" },
    });

    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("gives different task ids for the same allocation in two rebalancings", () => {
    const fields = { allocationId: "alloc-1" };

    const first = deriveRecordId(rebalancingTask, { parentId: REBALANCING_ID, fields });
    const second = deriveRecordId(rebalancingTask, { parentId: ACCOUNT_ID, fields });

    expect(first).not.toBe(second);
  });

  it("gives the same harvest id for the same portfolio and season", () => {
    expect(harvestId(ACCOUNT_ID, 1)).toBe(harvestId(ACCOUNT_ID, 1));
    expect(harvestId(ACCOUNT_ID, 1)).not.toBe(harvestId(ACCOUNT_ID, 2));
    expect(harvestId(ACCOUNT_ID, 1)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-/);
  });

  it("uses the user id for settings", () => {
    expect(deriveRecordId(settings, { userId: "user-1", fields: {} })).toBe("user-1");
  });
});
