import { defineRecord } from "../define-record";
import { f } from "../fields";

export const REBALANCING_TASK_ACTIONS = ["매수", "매도"] as const;
export const STOCK_PRICE_KINDS = ["realtime", "close"] as const;

const optionalNumber = () =>
  f.decimal({ nullable: true, default: null, normalize: ["finiteOrNull"] });

/**
 * 리밸런싱 할 일 (`rebalancing_task`, v2-2 에서 `rebalancing.tasks` jsonb 를 펼쳐 만든다).
 * 키 = uuidv5(rebalancingId, allocationId) — 옛 `task.id` 는 포트폴리오 배분 id 라 같은
 * 포트폴리오로 다시 리밸런싱하면 겹친다 (사용자 결정 2026-11-28).
 */
export const rebalancingTask = defineRecord({
  type: "rebalancingTask",
  table: "rebalancing_task",
  parent: { type: "rebalancing", column: "rebalancingId", onParentDelete: "tombstone" },
  key: { kind: "derived", namespace: "parent", name: "allocationId" },
  sortable: true,
  fields: {
    /** 포트폴리오 배분 id (옛 `task.id`). 세션 안에서 유일. */
    allocationId: f.text(),
    market: f.text(),
    ticker: f.text(),
    name: f.text(),
    action: f.enum(REBALANCING_TASK_ACTIONS),
    /** 사고팔 금액 (원, 양수). */
    amount: f.decimal({ normalize: ["finiteOrZero"] }),
    /** 시작 시점 가격. 시세가 없었으면 null. */
    price: f.decimal({ nullable: true, normalize: ["finiteOrNull"] }),
    /** 권장 수량. 가격이 없으면 null. */
    quantity: f.decimal({ nullable: true, normalize: ["finiteOrNull"] }),
    priceAsOf: f.timestamp({ nullable: true, default: null }),
    priceKind: f.enum(STOCK_PRICE_KINDS, { nullable: true, default: null }),
    executedQuantity: optionalNumber(),
    executedPrice: optionalNumber(),
    orderedQuantity: optionalNumber(),
    orderedPrice: optionalNumber(),
    filledQuantity: optionalNumber(),
    filledAmount: optionalNumber(),
    done: f.bool(),
  },
});
