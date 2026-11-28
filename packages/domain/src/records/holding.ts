import { defineRecord } from "../define-record";
import { f } from "../fields";

/**
 * 보유 종목 (`stock_holding`). `market`·`ticker`·`currency` 는 종목 마스터에서 복제한 값이고,
 * 빈 문자열이면 이름만 있는 옛 항목이다.
 */
export const holding = defineRecord({
  type: "holding",
  table: "stock_holding",
  parent: { type: "account", column: "accountId", onParentDelete: "tombstone" },
  key: { kind: "uuid" },
  sortable: true,
  fields: {
    market: f.text(),
    ticker: f.text(),
    name: f.text(),
    currency: f.text(),
    quantity: f.decimal({ normalize: ["finiteOrZero"] }),
    memo: f.text({ default: "" }),
  },
});
