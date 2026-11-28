import { SCHEMA_VERSION } from "@seedbook/domain";
import { applyChangesToMap, planStoreChanges, type RecordChange } from "./changes";
import { type LocalRecord, type RecordMap, recordKey, SYNCED_TYPES } from "./records";
import {
  composeStore,
  decomposeStore,
  INVESTMENT_STORE,
  PORTFOLIO_STORE,
  REBALANCING_STORE,
  type RecordStoreKey,
  STORE_SHAPES,
} from "./store-records";

/**
 * 백업 파일 (설계 §5.6). 기기 레코드를 그대로 담는다 — 앱이 모르는 필드도 남는다.
 *
 *   { format: "seedbook-backup", schemaVersion, exportedAt, accountTag, records: [...] }
 *
 * 불러오기는 파일 버전 ≤ 앱 버전일 때만 한다 (높으면 "앱을 업데이트한 뒤"). 낮으면 단계(`up`)로
 * 올린다. 레코드 형식 전의 백업(2.0·1.0, store 모양)은 버전 0 으로 보고, 0 → 1 단계가 store 의
 * decompose 로 레코드를 만든다 — 별도 변환기를 두지 않는다.
 */

export const BACKUP_FORMAT = "seedbook-backup";

export interface BackupRecord {
  type: string;
  id: string;
  parentId: string | null;
  sortKey: string | null;
  fields: Record<string, unknown>;
}

export interface RecordBackup {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  /** 내보낸 계정의 표시 (단방향 해시, `backupAccountTag`). */
  accountTag: string;
  records: BackupRecord[];
}

/** store 모양의 옛 백업 구역 (`data-backup.ts` 2.0). */
export interface LegacySections {
  investments?: unknown[];
  portfolios?: unknown[];
  rebalancingSessions?: unknown[];
}

export function buildRecordBackup(
  records: RecordMap,
  accountTag: string,
  now = new Date()
): RecordBackup {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    accountTag,
    records: [...records.values()]
      .filter((r) => SYNCED_TYPES.includes(r.type))
      .map((r) => ({
        type: r.type,
        id: r.id,
        parentId: r.parentId,
        sortKey: r.sortKey,
        fields: r.fields,
      })),
  };
}

export type ParsedBackupFile =
  | { kind: "records"; schemaVersion: number; accountTag: string | null; records: BackupRecord[] }
  | { kind: "legacy" }
  | { kind: "too_new"; schemaVersion: number }
  | { kind: "invalid" };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function isBackupRecord(value: unknown): value is BackupRecord {
  return (
    isObject(value) &&
    typeof value.type === "string" &&
    typeof value.id === "string" &&
    (value.parentId === null || typeof value.parentId === "string") &&
    (value.sortKey === null || typeof value.sortKey === "string") &&
    isObject(value.fields)
  );
}

/**
 * 버전 N → N+1 단계 (깨는 변경이 생기면 여기에 더한다, 설계 §7.3). 지우지 않는다 — 오래된 백업이
 * 여러 버전을 건너뛴다. 키는 올리기 전 버전.
 */
const BACKUP_STEPS: Record<number, (records: BackupRecord[]) => BackupRecord[]> = {};

/** 파일을 읽는다. 레코드 형식이면 앱 버전까지 올린 레코드. */
export function parseBackupFile(raw: unknown): ParsedBackupFile {
  if (!isObject(raw)) return { kind: "invalid" };
  if (raw.format !== BACKUP_FORMAT) {
    // 옛 store 모양 백업 (`version: "2.0"`).
    return raw.version && raw.exportedAt ? { kind: "legacy" } : { kind: "invalid" };
  }
  const version = raw.schemaVersion;
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1) {
    return { kind: "invalid" };
  }
  if (version > SCHEMA_VERSION) return { kind: "too_new", schemaVersion: version };
  if (!Array.isArray(raw.records) || !raw.records.every(isBackupRecord)) return { kind: "invalid" };
  let records = raw.records;
  for (let v = version; v < SCHEMA_VERSION; v += 1) {
    const step = BACKUP_STEPS[v];
    if (step) records = step(records);
  }
  return {
    kind: "records",
    schemaVersion: version,
    accountTag: typeof raw.accountTag === "string" ? raw.accountTag : null,
    records,
  };
}

const SECTION_STORES: Array<[keyof LegacySections, RecordStoreKey, string]> = [
  ["investments", INVESTMENT_STORE, "investments"],
  ["portfolios", PORTFOLIO_STORE, "portfolios"],
  ["rebalancingSessions", REBALANCING_STORE, "sessions"],
];

/**
 * 버전 0 (store 모양) → 레코드. 파일에 있는 구역의 타입만 돌려준다 — 없는 구역의 지금 데이터는
 * 건드리지 않는다. 계좌 ↔ 포트폴리오 연결은 `current` 의 계좌에도 건다.
 */
export function sectionsToRecords(
  sections: LegacySections,
  current: RecordMap
): { records: BackupRecord[]; types: string[]; links: RecordChange[] } {
  const types: string[] = [];
  let map: RecordMap = new Map(
    [...current].filter(
      ([, r]) =>
        !SECTION_STORES.some(([s, key]) => sections[s] && STORE_SHAPES[key].types.includes(r.type))
    )
  );
  const pending = new Map<string, string | null>();
  for (const [section, key, field] of SECTION_STORES) {
    const list = sections[section];
    if (!list) continue;
    types.push(...STORE_SHAPES[key].types);
    const plan = decomposeStore(key, { [field]: list }, map);
    if (plan) map = applyChangesToMap(map, planStoreChanges(key, plan, map, pending));
  }
  const records = [...map.values()].filter((r) => types.includes(r.type));
  // 파일의 포트폴리오가 이 기기에만 있는 계좌를 가리키면 그 계좌의 연결.
  const links: RecordChange[] = [];
  if (sections.portfolios && !sections.investments) {
    for (const record of map.values()) {
      const before = current.get(recordKey(record.type, record.id));
      if (
        record.type === "account" &&
        before &&
        before.fields.portfolioId !== record.fields.portfolioId
      ) {
        links.push({
          op: "put",
          type: record.type,
          id: record.id,
          parentId: record.parentId,
          sortKey: record.sortKey,
          fields: { portfolioId: record.fields.portfolioId ?? null },
        });
      }
    }
  }
  return { records, types, links };
}

/** 레코드 → store 모양 구역 (다른 계정의 백업 id 를 바꿀 때). */
export function recordsToSections(records: BackupRecord[]): Required<LegacySections> {
  const map: RecordMap = new Map(records.map((r) => [recordKey(r.type, r.id), r as LocalRecord]));
  return {
    investments: composeStore(INVESTMENT_STORE, map).investments as unknown[],
    portfolios: composeStore(PORTFOLIO_STORE, map).portfolios as unknown[],
    rebalancingSessions: composeStore(REBALANCING_STORE, map).sessions as unknown[],
  };
}

/**
 * 불러오기 → 기기 레코드 변경. `types` 의 지금 레코드 중 파일에 없는 것은 지운다 (파일의 항목으로
 * 바꾼다). 파일의 레코드는 통째로 쓴다 (기기 저장소가 정의로 검증한다).
 */
export function planImport(
  records: BackupRecord[],
  types: readonly string[],
  current: RecordMap
): RecordChange[] {
  const keep = new Set(records.map((r) => recordKey(r.type, r.id)));
  const changes: RecordChange[] = records
    .filter((r) => types.includes(r.type))
    .map((r) => ({ op: "put", ...r }));
  for (const [k, record] of current) {
    if (types.includes(record.type) && !keep.has(k)) {
      changes.push({ op: "delete", type: record.type, id: record.id });
    }
  }
  return changes;
}
