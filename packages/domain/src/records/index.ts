import type { RecordDefinition } from "../define-record";
import { account } from "./account";
import { accountRecord } from "./account-record";
import { allocation } from "./allocation";
import { cash } from "./cash";
import { holding } from "./holding";
import { portfolio } from "./portfolio";
import { rebalancing } from "./rebalancing";
import { rebalancingTask } from "./rebalancing-task";
import { settings } from "./settings";

export * from "./account";
export * from "./account-record";
export * from "./allocation";
export * from "./cash";
export * from "./holding";
export * from "./portfolio";
export * from "./rebalancing";
export * from "./rebalancing-task";
export * from "./settings";

/** 동기화 레코드 9종 (설계 §2.1). 부모가 하위 레코드보다 먼저 온다. */
export const RECORDS = [
  account,
  holding,
  cash,
  accountRecord,
  portfolio,
  allocation,
  rebalancing,
  rebalancingTask,
  settings,
] as const satisfies readonly RecordDefinition[];

export type RecordType = (typeof RECORDS)[number]["type"];
