import type { RecordDefinition } from "../define-record";
import { account } from "./account";
import { accountRecord } from "./account-record";
import { allocation } from "./allocation";
import { cash } from "./cash";
import { harvest } from "./harvest";
import { holding } from "./holding";
import { portfolio } from "./portfolio";
import { rebalancing } from "./rebalancing";
import { rebalancingTask } from "./rebalancing-task";
import { settings } from "./settings";

export * from "./account";
export * from "./account-record";
export * from "./allocation";
export * from "./cash";
export * from "./harvest";
export * from "./holding";
export * from "./portfolio";
export * from "./rebalancing";
export * from "./rebalancing-task";
export * from "./settings";

/** 동기화 레코드 10종 (설계 §2.1). 부모가 하위 레코드보다 먼저 온다. */
export const RECORDS = [
  account,
  holding,
  cash,
  accountRecord,
  portfolio,
  allocation,
  rebalancing,
  rebalancingTask,
  harvest,
  settings,
] as const satisfies readonly RecordDefinition[];

export type RecordType = (typeof RECORDS)[number]["type"];

/**
 * 레코드 타입이 생긴 스키마 버전 (없으면 1). 옛 버전 파일(백업)에 없는 타입은 그 파일이 모르는
 * 타입이라 불러오기에서 건드리지 않는다. 스냅샷과의 대조는 `records.test.ts`.
 */
const RECORD_TYPE_ADDED_IN: Partial<Record<RecordType, number>> = {
  harvest: 2,
};

/** 스키마 버전 `version` 에 있던 레코드 타입. */
export function recordTypesAt(version: number): RecordType[] {
  return RECORDS.map((r) => r.type).filter((type) => (RECORD_TYPE_ADDED_IN[type] ?? 1) <= version);
}
