import {
  type BackupRecord,
  type LegacySections,
  parseBackupFile,
  planImport,
  recordsToSections,
  sectionsToRecords,
} from "@mobile/lib/sync/v2/backup";
import type { RecordChange } from "@mobile/lib/sync/v2/changes";
import { type RecordMap, recordKey, SYNCED_TYPES } from "@mobile/lib/sync/v2/records";
import { recordTypesAt } from "@seedbook/domain";
import { backupAccountTag, resolveBackupIds } from "./backup-ids";
import { type BackupSections, parseBackup } from "./data-backup";
import { reassignIds } from "./reassign-ids";

/**
 * 백업 불러오기 (설계 §5.6). 파일을 기기 레코드 변경으로 바꾼다 — 저장(·cloud 모드 outbox)은 레코드
 * 계층이 한다. 파일에 있는 구역의 항목으로 지금 데이터를 바꾼다 (없는 구역은 그대로).
 *
 * - 레코드 형식 (`seedbook-backup`): 파일 버전이 앱보다 높으면 받지 않는다. 같은 계정이면 레코드를 그대로
 *   쓴다 (앱이 모르는 필드도 남는다). 다른 계정이면 id 를 이 계정의 것으로 바꾼다.
 * - 옛 store 모양 (2.0·1.0): 버전 0 → 레코드 단계 (store 의 decompose) 를 거친다. id 는 전처럼 정한다
 *   (`resolveBackupIds`).
 */

export interface BackupImport {
  records: BackupRecord[];
  /** 바꿀 레코드 타입 (파일에 있는 구역). */
  types: string[];
  /** 파일 밖의 지금 레코드에 걸 변경 (바뀐 id 로 다시 잇기). */
  relinks: RecordChange[];
}

export type PreparedImport =
  | { ok: true; plan: BackupImport }
  | { ok: false; reason: "invalid" | "too_new" };

export async function prepareBackupImport(
  raw: unknown,
  context: {
    userId: string;
    current: RecordMap;
    fetchOwnIds: () => Promise<ReadonlySet<string>>;
  }
): Promise<PreparedImport> {
  const file = parseBackupFile(raw);
  if (file.kind === "invalid") return { ok: false, reason: "invalid" };
  if (file.kind === "too_new") return { ok: false, reason: "too_new" };

  if (file.kind === "records") {
    if (file.accountTag === (await backupAccountTag(context.userId))) {
      // 파일 버전에 없던 타입(예: v1 백업의 수확 기록)은 파일이 모르는 것이라 그대로 둔다.
      const known = new Set<string>(recordTypesAt(file.schemaVersion));
      const types = SYNCED_TYPES.filter((type) => known.has(type));
      return { ok: true, plan: { records: file.records, types, relinks: [] } };
    }
    // 다른 계정의 백업 — store 모양으로 묶어 id 를 바꾼다.
    const sections = recordsToSections(file.records) as unknown as Partial<BackupSections>;
    const { data } = await reassignIds(sections, context.userId);
    return { ok: true, plan: fromSections(data, context.current, new Map()) };
  }

  const legacy = parseBackup(raw);
  if (!legacy.ok) return { ok: false, reason: "invalid" };
  const { data, newIds } = await resolveBackupIds(legacy, context.userId, {
    fetchOwnIds: context.fetchOwnIds,
  });
  return { ok: true, plan: fromSections(data, context.current, newIds) };
}

function fromSections(
  data: Partial<BackupSections>,
  current: RecordMap,
  newIds: ReadonlyMap<string, string>
): BackupImport {
  const { records, types, links } = sectionsToRecords(data as LegacySections, current);
  return { records, types, relinks: [...links, ...relinkCurrent(data, records, current, newIds)] };
}

/**
 * 파일에 없는 구역의 지금 레코드가 id 가 바뀐 계좌·포트폴리오를 가리키면 새 id 로 잇는다
 * (계좌의 포트폴리오 연결, 리밸런싱 기록의 계좌·포트폴리오).
 */
function relinkCurrent(
  data: Partial<BackupSections>,
  records: BackupRecord[],
  current: RecordMap,
  newIds: ReadonlyMap<string, string>
): RecordChange[] {
  if (newIds.size === 0) return [];
  const changes: RecordChange[] = [];
  const put = (record: BackupRecord, fields: Record<string, unknown>) =>
    changes.push({ op: "put", ...record, fields });

  if (data.investments && !data.portfolios) {
    for (const [oldId, newId] of newIds) {
      const before = current.get(recordKey("account", oldId));
      const restored = records.find((r) => r.type === "account" && r.id === newId);
      if (before?.fields.portfolioId && restored) {
        restored.fields = { ...restored.fields, portfolioId: before.fields.portfolioId };
      }
    }
  }
  if (!data.rebalancingSessions) {
    for (const record of current.values()) {
      if (record.type !== "rebalancing") continue;
      const fields: Record<string, unknown> = {};
      for (const name of ["accountId", "portfolioId"]) {
        const next = newIds.get(String(record.fields[name]));
        if (next) fields[name] = next;
      }
      if (Object.keys(fields).length > 0) put(record, fields);
    }
  }
  return changes;
}

/** 불러오기 → 기기 레코드 변경. */
export function planBackupImport(plan: BackupImport, current: RecordMap): RecordChange[] {
  return [...planImport(plan.records, plan.types, current), ...plan.relinks];
}
