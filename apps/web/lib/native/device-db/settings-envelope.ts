import { settings } from "@seedbook/domain";
import { readRecords, writeRecords } from "./record-store";
import type { SqlDriver } from "./sql-driver";

/**
 * 계정 설정 store (`seedbook.preferences`) envelope ↔ 기기 레코드 `settings` (앱 SQLite 의 기본 자리).
 * 쓰기는 `writeRecords()` 하나로 (정의 검증·체크섬·이력). 정의가 모르는 옛 필드는 레코드에 남아도
 * envelope 로 내보내지 않는다.
 */

export const PREFERENCES_KEY = "seedbook.preferences";

/**
 * 설정 레코드의 id. 서버는 사용자 id 이지만 기기 저장소는 계정을 모른다 (계정 자리는
 * `account-storage.ts` 가 나눈다). 설정은 `/api/me/preferences` 로 주고받고 동기화 v2 에 넣지 않는다.
 */
export const DEVICE_SETTINGS_ID = "device";

/** `lib/preferences-store.ts` 의 persist version 과 같다. */
const PREFERENCES_STORE_VERSION = 1;

const PREFERENCE_FIELDS = Object.keys(settings.fields);

export function isSettingsEnvelopeKey(key: string): boolean {
  return key === PREFERENCES_KEY;
}

/** 넘긴 이름 중 값이 있는 것만 (없는 필드는 패치에 넣지 않는다). */
function pick(item: Record<string, unknown>, names: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of names) if (item[name] !== undefined) out[name] = item[name];
  return out;
}

function envelopeState(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as { state?: unknown };
    const state = parsed?.state;
    return typeof state === "object" && state !== null && !Array.isArray(state)
      ? (state as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** 레코드에서 envelope 를 만든다. 저장된 것이 없으면 null. */
export async function readSettingsEnvelope(driver: SqlDriver): Promise<string | null> {
  const { records } = await readRecords(driver, { types: [settings.type] });
  const row = records.find((r) => r.id === DEVICE_SETTINGS_ID);
  if (!row) return null;
  return JSON.stringify({
    state: pick(row.data, PREFERENCE_FIELDS),
    version: PREFERENCES_STORE_VERSION,
  });
}

/** envelope 의 설정을 패치로 저장한다. 검증에 실패한 필드는 쓰지 않고 격리한다 (기존 값 유지). */
export async function writeSettingsEnvelope(
  driver: SqlDriver,
  value: string,
  writtenBy: string
): Promise<void> {
  const state = envelopeState(value);
  if (!state) return;
  const fields = pick(state, PREFERENCE_FIELDS);
  if (Object.keys(fields).length === 0) return;
  await writeRecords(driver, [{ op: "put", type: settings.type, id: DEVICE_SETTINGS_ID, fields }], {
    writtenBy,
  });
}

/** persist 의 removeItem — 설정 레코드를 톰스톤으로 (다음 읽기는 기본값). */
export async function removeSettingsEnvelope(driver: SqlDriver, writtenBy: string): Promise<void> {
  const { records } = await readRecords(driver, { types: [settings.type] });
  if (!records.some((r) => r.id === DEVICE_SETTINGS_ID)) return;
  await writeRecords(driver, [{ op: "delete", type: settings.type, id: DEVICE_SETTINGS_ID }], {
    writtenBy,
  });
}
