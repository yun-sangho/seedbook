import {
  comparePlantGrowth,
  PLANT_FIELDS,
  readPlantProgress,
} from "@mobile/features/portfolio/utils/portfolio-plant";
import { portfolio } from "@seedbook/domain";
import type { RecordChange } from "./changes";
import type { SyncEngine } from "./engine";
import type { RecordLayer } from "./record-layer";
import {
  changedKnownFields,
  isSortable,
  knownFields,
  type LocalRecord,
  recordKey,
  SYNCED_TYPES,
} from "./records";
import { emptySyncState, type OutboxEntry, type ShadowEntry } from "./sync-state";

/**
 * 저장소 모드 전환 (설계 §5.5). 전환도 push/pull 이다 — envelope 번역기를 쓰지 않는다.
 *
 * - **local → cloud**: 서버 레코드를 받아, 로컬 레코드마다 서버에 없으면 만들고 있으면 다른 필드만
 *   패치한다 (로컬 우선). 서버에만 있는 레코드는 이어지는 전체 pull 로 기기에 들어온다 (합집합).
 *   예외 하나: 포트폴리오 식물(`PLANT_FIELDS` — 수확 주기 번호·종류·소원·목표·단계·이력·열매)은 묶어서 더 자란
 *   쪽을 남긴다 — (수확 주기 번호, 단계, 열매가 열림) 사전순. `driftSince` 는 묶음 밖이라 로컬 우선.
 * - **cloud → local**: 보내지 못한 변경을 먼저 보낸다 — 실패하면 전환을 막는다. 기기 레코드는 이미
 *   서버 레코드 전체(모르는 필드 포함)를 담고 있으니, 최신까지 받은 뒤 outbox·섀도를 비운다.
 *
 * 어느 쪽도 레코드를 지우지 않는다 — 단, 서버에서 지워진 레코드를 만들려 하면 삭제가 이긴다.
 */

export class ModeSwitchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModeSwitchError";
  }
}

/** 서버의 식물이 이 기기보다 더 자랐는가. */
function serverPlantFurther(
  local: Record<string, unknown>,
  server: Record<string, unknown>
): boolean {
  return comparePlantGrowth(readPlantProgress(server), readPlantProgress(local)) > 0;
}

/** 로컬 레코드 하나를 서버 값과 합치는 op 와 기기 변경. */
function mergeWithServer(
  local: LocalRecord,
  server: ShadowEntry | undefined,
  seq: number
): { entry: OutboxEntry | null; change: RecordChange | null } {
  const base = { type: local.type, id: local.id, parentId: local.parentId, seq };
  const sortKey =
    isSortable(local.type) && local.sortKey !== null && local.sortKey !== server?.sortKey
      ? { sortKey: local.sortKey }
      : {};
  if (!server) {
    return {
      entry: { ...base, op: "create", fields: knownFields(local.type, local.fields), ...sortKey },
      change: null,
    };
  }
  const fields = changedKnownFields(local.type, server.fields, local.fields);
  let change: RecordChange | null = null;
  if (local.type === portfolio.type && serverPlantFurther(local.fields, server.fields)) {
    // 서버의 식물이 더 자랐다 — 그 묶음을 기기에 받고 보내지 않는다.
    const plant: Record<string, unknown> = {};
    for (const name of PLANT_FIELDS) {
      delete fields[name];
      plant[name] = server.fields[name];
    }
    change = {
      op: "put",
      type: local.type,
      id: local.id,
      parentId: local.parentId,
      sortKey: local.sortKey,
      fields: plant,
    };
  }
  if (Object.keys(fields).length === 0 && !("sortKey" in sortKey)) return { entry: null, change };
  return { entry: { ...base, op: "patch", fields, ...sortKey }, change };
}

/** local → cloud. 성공하면 동기화 상태가 서버와 맞춰져 있다 (호출한 쪽이 모드를 바꾸고 새로고침한다). */
export async function mergeLocalIntoCloud(
  engine: SyncEngine,
  layer: RecordLayer,
  now: () => string = () => new Date().toISOString()
): Promise<void> {
  const server = await engine.fetchServerRecords();
  if (!Array.isArray(server)) throw new ModeSwitchError("서버 데이터를 받지 못했어요");

  await layer.applySync((local) => {
    const state = emptySyncState(now());
    for (const record of server) {
      state.shadow[recordKey(record.type, record.id)] = {
        parentId: record.parentId,
        version: record.version,
        changeSeq: record.changeSeq,
        sortKey: record.sortKey,
        fields: record.fields,
      };
    }
    const changes: RecordChange[] = [];
    for (const [k, record] of local) {
      if (!SYNCED_TYPES.includes(record.type)) continue;
      state.seq += 1;
      const merged = mergeWithServer(record, state.shadow[k], state.seq);
      if (merged.entry) state.outbox[k] = merged.entry;
      if (merged.change) changes.push(merged.change);
    }
    return { state, changes, result: undefined };
  });

  try {
    if ((await engine.push()) !== "ok") throw new ModeSwitchError("서버에 올리지 못했어요");
    // 커서 없이 전부 받아 서버에만 있던 레코드까지 기기에 담는다.
    await layer.applySync((_local, state) => ({
      state: { ...state, cursor: null },
      changes: [],
      result: undefined,
    }));
    if ((await engine.pull()) !== "ok") throw new ModeSwitchError("서버 데이터를 받지 못했어요");
    if (Object.keys(layer.loadState().outbox).length > 0 && (await engine.push()) !== "ok") {
      throw new ModeSwitchError("서버에 올리지 못했어요");
    }
  } catch (error) {
    // 다시 시도하면 처음부터 다시 합친다 (몇 번을 해도 결과가 같다).
    layer.clearSyncState();
    throw error;
  }
}

/** cloud → local. 보내지 못한 변경이 남으면 막는다. */
export async function finishCloudForLocal(engine: SyncEngine, layer: RecordLayer): Promise<void> {
  const outcome = await engine.sync();
  if (outcome !== "ok" || Object.keys(layer.loadState().outbox).length > 0) {
    throw new ModeSwitchError(
      "아직 서버에 보내지 못한 변경이 있어요. 연결을 확인하고 다시 시도해 주세요"
    );
  }
  layer.clearSyncState();
}
