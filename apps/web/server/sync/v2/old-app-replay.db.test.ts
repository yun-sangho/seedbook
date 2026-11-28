import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createSnapshot,
  deriveRecordId,
  type FieldSpec,
  MIN_SCHEMA,
  type PulledRecord,
  type PullResponse,
  parseValue,
  RECORDS,
  SCHEMA_VERSION,
  type SchemaSnapshot,
  type SyncOp,
  type SyncOpResult,
  sampleValue,
} from "@seedbook/domain";
import { openTestDb } from "@web/test/db/test-db";
import { afterAll, describe, expect, it } from "vitest";
import { handlePull } from "./pull";
import { handlePush } from "./push";

/**
 * 옛 앱 재생 (설계 §7.5-3). 지원 구간 `[MIN_SCHEMA, SCHEMA_VERSION]` 의 출시 스냅샷마다, 그 버전의 정의만
 * 아는 클라이언트가 **지금 서버**(실제 push/pull 핸들러 + 테스트 DB)와 동기화할 수 있는지 본다.
 *
 * 1. 그 버전의 필드로 모든 레코드 타입을 만들고(create) 받을 수 있다.
 * 2. 지금 서버가 주는 레코드를 그 버전의 정의로 읽어도 실패하지 않는다 (모르는 필드는 무시).
 * 3. 새 기기가 쓴 레코드를 옛 앱이 패치해도, 옛 앱이 모르는 필드는 그대로 남는다 (패치 의미 +
 *    기본값은 생성 때만).
 *
 * 출시 스냅샷이 지금 정의와 같으면(확장이 아직 없으면) 3 은 확인할 것이 없다. 그래서 지금 정의에서
 * 기본값이 있는 필드(확장으로 더할 수 있는 필드)를 뺀 "가상의 옛 버전" 도 함께 돌려 이 틀이 실제로
 * 모르는 필드의 보존을 확인하게 한다.
 */

const { db, createTestUser, close } = openTestDb();
afterAll(close);

const SNAPSHOT_DIR = join(import.meta.dirname, "../../../../../packages/domain/schema-snapshots");

function releasedSnapshots(): SchemaSnapshot[] {
  return readdirSync(SNAPSHOT_DIR)
    .filter((name) => /^v\d+\.json$/.test(name))
    .map((name) => JSON.parse(readFileSync(join(SNAPSHOT_DIR, name), "utf8")) as SchemaSnapshot)
    .filter((s) => s.schemaVersion >= MIN_SCHEMA && s.schemaVersion <= SCHEMA_VERSION)
    .sort((a, b) => a.schemaVersion - b.schemaVersion);
}

/** 지금 정의에서 기본값이 있는 필드를 뺀 옛 버전 (확장 전의 앱을 흉내 낸다). */
function syntheticOlderSnapshot(): SchemaSnapshot {
  const current = createSnapshot(RECORDS, { schemaVersion: SCHEMA_VERSION, minSchema: MIN_SCHEMA });
  const records = Object.fromEntries(
    Object.entries(current.records).map(([type, record]) => [
      type,
      {
        ...record,
        fields: Object.fromEntries(
          Object.entries(record.fields).filter(([, spec]) => spec.default === undefined)
        ),
      },
    ])
  );
  return { ...current, records };
}

const CASES: Array<[string, SchemaSnapshot]> = [
  ...releasedSnapshots().map((s): [string, SchemaSnapshot] => [`v${s.schemaVersion}`, s]),
  ["가상의 옛 버전 (기본값 있는 필드 없음)", syntheticOlderSnapshot()],
];

const DEFINITIONS = new Map(RECORDS.map((d) => [d.type as string, d]));

async function push(userId: string, schema: number, ops: SyncOp[]): Promise<SyncOpResult[]> {
  const res = await handlePush(
    new Request("http://localhost/api/sync/v2/push", {
      method: "POST",
      headers: { "x-seedbook-sync": "2", "x-seedbook-schema": String(schema) },
      body: JSON.stringify({ ops }),
    }),
    { db, resolveUserId: async () => userId, log: () => {} }
  );
  expect(res.status).toBe(200);
  return ((await res.json()) as { results: SyncOpResult[] }).results;
}

async function pullAll(userId: string, schema: number): Promise<PulledRecord[]> {
  const records: PulledRecord[] = [];
  let cursor: string | undefined;
  for (;;) {
    const params = new URLSearchParams(cursor ? { cursor } : {});
    const res = await handlePull(
      new Request(`http://localhost/api/sync/v2/pull?${params}`, {
        headers: { "x-seedbook-sync": "2", "x-seedbook-schema": String(schema) },
      }),
      { db, resolveUserId: async () => userId, log: () => {} }
    );
    expect(res.status).toBe(200);
    const page = (await res.json()) as PullResponse;
    records.push(...page.records);
    cursor = page.cursor;
    if (!page.hasMore) return records;
  }
}

/** 스냅샷의 필드 표본. 다른 레코드를 가리키는 값은 비운다 (없는 포트폴리오를 가리키지 않게). */
function sampleFields(fields: Record<string, FieldSpec>, tag: string): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([name, spec]) => {
      if (spec.kind === "uuidRef" && spec.nullable) return [name, null];
      const value = sampleValue(spec, name);
      // 글자 필드는 쓴 쪽이 보이게 (옛 앱의 패치가 실제로 적용됐는지 가린다).
      return [name, spec.kind === "text" ? `${value}-${tag}` : value];
    })
  );
}

/** 부모부터 모든 레코드 타입의 create op (스냅샷이 아는 필드로). */
function createOps(
  snapshot: SchemaSnapshot,
  userId: string,
  tag: string
): Array<SyncOp & { fields: Record<string, unknown> }> {
  const ids = new Map<string, string>();
  const ops: Array<SyncOp & { fields: Record<string, unknown> }> = [];
  for (const definition of RECORDS) {
    const record = snapshot.records[definition.type];
    if (!record) continue;
    const fields = sampleFields(record.fields, tag);
    const parentId = record.parent ? ids.get(record.parent.type) : undefined;
    const id =
      record.key.kind === "uuid"
        ? randomUUID()
        : deriveRecordId(definition, { parentId, userId, fields });
    ids.set(definition.type, id);
    ops.push({
      type: definition.type,
      id,
      op: "create",
      fields,
      ...(parentId ? { parentId } : {}),
      ...(record.sortable ? { sortKey: "a0" } : {}),
    });
  }
  return ops;
}

describe.each(CASES)("old app %s against the current server", (_, snapshot) => {
  const schema = Math.max(MIN_SCHEMA, Math.min(snapshot.schemaVersion, SCHEMA_VERSION));
  const types = Object.keys(snapshot.records).filter((type) => DEFINITIONS.has(type));

  it("knows every record type it can sync (none removed)", () => {
    expect(types.sort()).toEqual(Object.keys(snapshot.records).sort());
  });

  it("creates every record type with only the fields it knows", async () => {
    const userId = await createTestUser();

    const results = await push(userId, schema, createOps(snapshot, userId, "old"));

    expect(results.map((r) => r.status)).toEqual(types.map(() => "ok"));
  });

  it("reads what the current server sends with its own definition (unknown fields ignored)", async () => {
    const userId = await createTestUser();
    // 새 기기가 지금 정의의 모든 필드로 만든 레코드.
    const current = createSnapshot(RECORDS, {
      schemaVersion: SCHEMA_VERSION,
      minSchema: MIN_SCHEMA,
    });
    await push(userId, SCHEMA_VERSION, createOps(current, userId, "new"));

    const pulled = await pullAll(userId, schema);

    // 옛 앱은 자기가 아는 타입을 모두 받고, 그 뒤에 생긴 타입(예: v1 앱의 harvest)은 읽지 않고
    // 기기에 그대로 보관한다 (설계 §7.4, `applyPulled`·`verifyStoredRow`).
    const pulledTypes = new Set(pulled.map((r) => r.type));
    expect([...pulledTypes].filter((type) => types.includes(type)).sort()).toEqual(
      [...types].sort()
    );
    expect([...pulledTypes].sort()).toEqual(RECORDS.map((r) => r.type).sort());
    for (const record of pulled) {
      const known = snapshot.records[record.type]?.fields ?? {};
      for (const [name, spec] of Object.entries(known)) {
        expect(parseValue(spec, record.fields[name], "open").ok, `${record.type}.${name}`).toBe(
          true
        );
      }
    }
  });

  it("keeps the fields it does not know when it patches a record written by a newer device", async () => {
    const userId = await createTestUser();
    const current = createSnapshot(RECORDS, {
      schemaVersion: SCHEMA_VERSION,
      minSchema: MIN_SCHEMA,
    });
    const created = createOps(current, userId, "new");
    await push(userId, SCHEMA_VERSION, created);

    // 옛 앱: 받은 레코드에서 자기가 아는 필드만 고쳐 보낸다 (키 필드는 바꾸지 않는다).
    const patches: SyncOp[] = created.map((op) => {
      const known = snapshot.records[op.type]?.fields ?? {};
      const key = snapshot.records[op.type]?.key;
      const keyName = key?.kind === "derived" ? key.name : null;
      const fields = Object.fromEntries(
        Object.entries(sampleFields(known, "old")).filter(([name]) => name !== keyName)
      );
      return { type: op.type, id: op.id, op: "patch", fields };
    });
    const results = await push(userId, schema, patches);
    const pulled = new Map((await pullAll(userId, SCHEMA_VERSION)).map((r) => [r.id, r]));

    expect(results.map((r) => r.status)).toEqual(created.map(() => "ok"));
    for (const op of created) {
      const known = snapshot.records[op.type]?.fields ?? {};
      const fields = pulled.get(op.id)?.fields ?? {};
      for (const [name, value] of Object.entries(op.fields)) {
        if (name in known) continue;
        // 옛 앱이 모르는 필드 — 새 기기가 쓴 값 그대로 (기본값으로 덮이지 않았다).
        expect(fields[name], `${op.type}.${name}`).toEqual(value);
      }
    }
  });
});
