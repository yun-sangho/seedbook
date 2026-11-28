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
  compact = false,
}: {
  summary: PriceAsOfSummary;
  live: boolean;
  /** 한 화면에 다 들어가야 하는 단계 화면 — 경고의 첫 문장만 ("지금보다 1일 전 가격이에요."). */
  compact?: boolean;
}) {
  const now = new Date();
  const label = describePriceAsOf(summary, now);
  const warning = live ? priceAgeWarning(summary.asOf, now) : null;
  if (!warning) return <PriceAsOfSummaryBanner summary={summary} />;
  const description = compact ? firstSentence(warning) : warning;
  return <PriceBanner title={label.title} description={description} tone="warning" />;
}

function firstSentence(text: string): string {
  const end = text.indexOf(". ");
  return end < 0 ? text : text.slice(0, end + 1);
}
