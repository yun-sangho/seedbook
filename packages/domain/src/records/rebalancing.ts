import { defineRecord } from "../define-record";
import { f, shape } from "../fields";

/** 결과 스냅샷에 담을 수 있는 종목 수. */
export const MAX_RESULT_HOLDINGS = 200;

const resultHolding = shape.object({
  market: f.text(),
  ticker: f.text(),
  name: f.text(),
  quantity: f.decimal(),
  change: f.decimal(),
  percent: f.decimal({ nullable: true }),
  targetPercent: f.decimal(),
});

/**
 * 리밸런싱 (`rebalancing`). 계좌·포트폴리오가 지워져도 기록이 남도록 부모 없이 id 와 이름을 함께
 * 보관한다 (`accountId`·`portfolioId` 는 참조가 아니라 기록). 할 일은 `rebalancingTask` 레코드다.
 */
export const rebalancing = defineRecord({
  type: "rebalancing",
  table: "rebalancing",
  key: { kind: "uuid" },
  sortable: true,
  fields: {
    accountId: f.text(),
    accountName: f.text(),
    portfolioId: f.text(),
    portfolioName: f.text(),
    /** 거래 가능 금액 − 시작 때 예수금 (원). */
    cashDelta: f.money({ normalize: ["finiteOrZero", "round"] }),
    startedAt: f.timestamp(),
    completedAt: f.timestamp({ nullable: true, default: null }),
    /** 완료하며 계좌에 반영한 뒤의 구성. 반영하지 않았으면 null. */
    result: f.json(
      shape.object({
        holdings: f.json(shape.list(resultHolding, { maxItems: MAX_RESULT_HOLDINGS })),
        cash: f.decimal(),
        cashPercent: f.decimal({ nullable: true }),
        cashBefore: f.decimal({ nullable: true, default: null }),
      }),
      { nullable: true, default: null }
    ),
  },
});
