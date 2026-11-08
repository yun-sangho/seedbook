import {
  summarizePriceAsOf,
  type PriceAsOfSummary,
} from "@web/features/investments/utils/price-as-of";
import type { RebalancingTask } from "../types/types";

/**
 * 할 일이 어느 시점 가격으로 계산됐는지. 기준 시각을 기록하기 전에 시작한 할 일은 건너뛰고,
 * 아는 것이 하나도 없으면 null.
 */
export function summarizeRebalancingPriceAsOf(tasks: RebalancingTask[]): PriceAsOfSummary | null {
  return summarizePriceAsOf(
    tasks.flatMap((t) =>
      // 예전 로컬 저장본은 키 자체가 없어 undefined 일 수 있다 — null 과 같이 건너뛴다.
      t.priceAsOf && t.priceKind ? [{ asOf: t.priceAsOf, kind: t.priceKind }] : []
    )
  );
}
