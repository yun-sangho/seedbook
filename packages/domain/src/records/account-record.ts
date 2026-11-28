import { defineRecord } from "../define-record";
import { f } from "../fields";

/**
 * 계좌 금액 기록 (`investment_record`). 키 = uuidv5(accountId, date) — 두 기기가 같은 날짜를
 * 따로 만들어도 같은 레코드로 수렴한다. 날짜 순으로 보여 주므로 `sortKey` 는 두지 않는다.
 */
export const accountRecord = defineRecord({
  type: "accountRecord",
  table: "investment_record",
  parent: { type: "account", column: "accountId", onParentDelete: "tombstone" },
  key: { kind: "derived", namespace: "parent", name: "date" },
  fields: {
    date: f.date(),
    initialInvestment: f.money({ normalize: ["finiteOrZero", "trunc"] }),
    currentValue: f.money({ normalize: ["finiteOrZero", "trunc"] }),
  },
});
