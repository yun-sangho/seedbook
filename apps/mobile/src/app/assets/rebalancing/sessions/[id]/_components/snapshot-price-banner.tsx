"use client";

import { PriceAsOfSummaryBanner, PriceBanner } from "@mobile/components/mobile/price-as-of-banner";
import {
  describePriceAsOf,
  type PriceAsOfSummary,
} from "@mobile/features/investments/utils/price-as-of";
import { priceAgeWarning } from "@mobile/features/rebalancing/utils/price-age";

/**
 * 권장 수량을 계산한 시작 시점 가격의 기준 시각. 진행 중인데 그 가격이 지금보다 5분 이상
 * 오래됐으면 경고로 알린다 (시세가 달라졌을 수 있다). 완료된 기록은 경고하지 않는다.
 */
export function SnapshotPriceBanner({
  summary,
  live,
}: {
  summary: PriceAsOfSummary;
  live: boolean;
}) {
  const now = new Date();
  const label = describePriceAsOf(summary, now);
  const warning = live ? priceAgeWarning(summary.asOf, now) : null;
  if (!warning) return <PriceAsOfSummaryBanner summary={summary} />;
  return <PriceBanner title={label.title} description={warning} tone="warning" />;
}
