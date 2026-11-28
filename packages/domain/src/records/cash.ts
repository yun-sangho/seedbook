import { defineRecord } from "../define-record";
import { f } from "../fields";

/** 현금성 자산 항목 (`cash_item`, 예수금·CMA 등). */
export const cash = defineRecord({
  type: "cash",
  table: "cash_item",
  parent: { type: "account", column: "accountId", onParentDelete: "tombstone" },
  key: { kind: "uuid" },
  sortable: true,
  fields: {
    label: f.text(),
    amount: f.money({ normalize: ["finiteOrZero", "trunc"] }),
  },
});
