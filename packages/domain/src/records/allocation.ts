import { defineRecord } from "../define-record";
import { f } from "../fields";

/** 포트폴리오의 종목별 목표 비중 (`portfolio_allocation`). `targetPercent` 는 % (소수 허용). */
export const allocation = defineRecord({
  type: "allocation",
  table: "portfolio_allocation",
  parent: { type: "portfolio", column: "portfolioId", onParentDelete: "tombstone" },
  key: { kind: "uuid" },
  sortable: true,
  fields: {
    market: f.text(),
    ticker: f.text(),
    name: f.text(),
    currency: f.text(),
    targetPercent: f.decimal({ normalize: ["finiteOrZero"] }),
  },
});
