import { withDescendants } from "./changes";
import type { RecordLayer } from "./record-layer";
import { knownFields, recordKey } from "./records";
import { emptySyncState } from "./sync-state";

/**
 * v1 엔티티 동기화에서 v2 로 처음 넘어올 때 (cloud 모드 기기의 첫 실행). v1 이 아직 보내지 못한 변경
 * (`seedbook.sync.<도메인>` 의 outbox) 을 v2 outbox 로 옮긴다 — 그 항목(과 하위 레코드)은 이 기기 값이
 * 이긴다. 나머지는 이어지는 전체 pull 이 서버 값으로 맞춘다.
 *
 * v1 의 하위 목록 통째 교체에서 지운 하위 레코드(서버에만 남은 것)는 옮기지 않는다 — 드문 경우이고,
 * 다음 편집 때 다시 지울 수 있다.
 */

/** v1 store 별 동기화 상태 키와 그 목록 항목의 레코드 타입. */
export const V1_META_KEYS: Array<{ key: string; type: string }> = [
  { key: "seedbook.sync.investment", type: "account" },
  { key: "seedbook.sync.portfolio", type: "portfolio" },
  { key: "seedbook.sync.rebalancing", type: "rebalancing" },
];

interface V1Meta {
  meta?: { outbox?: Record<string, { op?: string }> };
}

function readV1Outbox(raw: string | null): Array<[string, "upsert" | "delete"]> {
  if (!raw) return [];
  try {
    const outbox = (JSON.parse(raw) as V1Meta).meta?.outbox ?? {};
    return Object.entries(outbox).flatMap(
      ([id, entry]): Array<[string, "upsert" | "delete"]> =>
        entry?.op === "upsert" || entry?.op === "delete" ? [[id, entry.op]] : []
    );
  } catch {
    return [];
  }
}

export async function adoptV1Outbox(
  layer: RecordLayer,
  readItem: (key: string) => string | null,
  now: () => string = () => new Date().toISOString()
): Promise<void> {
  await layer.applySync((local) => {
    const state = emptySyncState(now());
    for (const { key, type } of V1_META_KEYS) {
      for (const [id, op] of readV1Outbox(readItem(key))) {
        if (op === "delete") {
          if (local.has(recordKey(type, id))) continue;
          state.seq += 1;
          state.outbox[recordKey(type, id)] = {
            type,
            id,
            op: "delete",
            parentId: null,
            fields: {},
            seq: state.seq,
          };
          continue;
        }
        for (const record of withDescendants(local, type, id)) {
          state.seq += 1;
          state.outbox[recordKey(record.type, record.id)] = {
            type: record.type,
            id: record.id,
            op: "create",
            parentId: record.parentId,
            fields: knownFields(record.type, record.fields),
            ...(record.sortKey !== null ? { sortKey: record.sortKey } : {}),
            seq: state.seq,
          };
        }
      }
    }
    return { state, changes: [], result: undefined };
  });
}
