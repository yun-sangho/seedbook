// @vitest-environment node
import { deriveRecordId, RECORDS, SAMPLE_UUID, sampleRecord } from "@seedbook/domain";
import { migrateDeviceDatabase } from "@web/lib/native/device-db/migrations";
import { readRecords, writeRecords } from "@web/lib/native/device-db/record-store";
import { createNodeSqliteDriver } from "@web/lib/native/device-db/testing/node-sqlite-driver";
import { describe, expect, it } from "vitest";

/**
 * 레코드 정의 ↔ 기기 SQLite. 기기는 레코드 JSON 테이블 하나(`records`, 설계 §2.5)라 필드마다
 * 컬럼이 없다 — 정의의 모든 레코드가 그대로 저장되고 읽히는지, 정의에 없는 필드(새 앱의 필드)가
 * 남는지 본다.
 */

const writtenBy = "contract@1";

function recordId(definition: (typeof RECORDS)[number], fields: Record<string, unknown>) {
  if (definition.key.kind === "uuid") return SAMPLE_UUID;
  return deriveRecordId(definition, { parentId: SAMPLE_UUID, userId: "user-1", fields });
}

async function openDevice() {
  const driver = createNodeSqliteDriver();
  await migrateDeviceDatabase(driver);
  return driver;
}

describe("record definitions ↔ device records", () => {
  it.each(RECORDS.map((r) => [r.type, r] as const))(
    "%s is stored and read back as it was written",
    async (type, definition) => {
      const driver = await openDevice();
      const fields = sampleRecord(definition) as Record<string, unknown>;
      const id = recordId(definition, fields);

      const outcome = await writeRecords(
        driver,
        [{ op: "put", type, id, parentId: definition.parent ? SAMPLE_UUID : null, fields }],
        { writtenBy }
      );

      expect(outcome.quarantined).toEqual([]);
      const { records } = await readRecords(driver, { types: [type] });
      expect(records.map((r) => r.data)).toEqual([fields]);
    }
  );

  it.each(RECORDS.map((r) => [r.type, r] as const))(
    "%s keeps a field the definition does not know",
    async (type, definition) => {
      const driver = await openDevice();
      const fields = sampleRecord(definition) as Record<string, unknown>;
      const id = recordId(definition, fields);
      await writeRecords(
        driver,
        [{ op: "put", type, id, fields, extra: { addedLater: { kept: true } } }],
        { writtenBy: "newer@2" }
      );

      await writeRecords(driver, [{ op: "put", type, id, fields }], { writtenBy });

      const { records } = await readRecords(driver, { types: [type] });
      expect(records[0]?.data.addedLater).toEqual({ kept: true });
    }
  );
});
