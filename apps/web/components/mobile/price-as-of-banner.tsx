"use client";

import { useMemo } from "react";
import { IconClockLine } from "@karrotmarket/react-monochrome-icon";
import { PageBanner, PrefixIcon } from "@seed-design/react";
import type { InvestmentItem } from "@web/features/investments/types/types";
import {
  describePriceAsOf,
  summarizePriceAsOf,
  type PriceAsOfLabel,
  type PriceAsOfSummary,
} from "@web/features/investments/utils/price-as-of";
import {
  useStockPrices,
  type StockPricePoint,
} from "@web/features/investments/utils/use-stock-prices";

/**
 * 시세로 계산한 금액이 "언제 가격 기준인지" 를 화면 상단에 항상 보여주는 배너.
 * 장중이면 마지막 체결 시각만, 아니면 종가 (거래일) 를 표시한다. 시세는 1분 남짓 간격으로
 * 갱신되므로 "실시간" 같은 말은 붙이지 않는다.
 * 받은 시세가 하나도 없으면 아무것도 그리지 않는다.
 *
 * @see https://seed-design.io/react/components/page-banner
 */
export function PriceAsOfBanner({ prices }: { prices: ReadonlyMap<string, StockPricePoint> }) {
  const summary = useMemo(() => summarizePriceAsOf(prices.values()), [prices]);
  return <PriceAsOfSummaryBanner summary={summary} />;
}

/**
 * 요약(`PriceAsOfSummary`)으로 바로 그리는 배너. 시세 맵이 아니라 저장해 둔 기준 시각을
 * 보여줄 때 (예: 리밸런싱 할 일의 시작 시점 시세) 쓴다.
 */
export function PriceAsOfSummaryBanner({ summary }: { summary: PriceAsOfSummary | null }) {
  if (!summary) return null;

  // prices 는 70초마다 새로 받으므로 "오늘" 판정용 now 도 그때마다 갱신된다.
  const label = describePriceAsOf(summary, new Date());

  return <PriceBanner title={label.title} description={label.description} tone={label.tone} />;
}

/**
 * 가격 기준 배너의 모양. 스크롤해도 화면 상단(앱바 아래)에 붙어 있도록 고정하고, 뒤 내용이
 * 비치지 않게 배경을 깐다. 시세 요약 없이 문구를 직접 정할 때도 쓴다.
 */
export function PriceBanner({
  title,
  description,
  tone = "neutral",
}: {
  title: string;
  description?: string;
  tone?: PriceAsOfLabel["tone"] | "warning";
}) {
  return (
    <div className="bg-bg-layer-default sticky top-0 z-[1]">
      <PageBanner.Root variant="weak" tone={tone} role="status" aria-live="polite">
        <PrefixIcon svg={<IconClockLine />} />
        <PageBanner.Content>
          <PageBanner.Body>
            <PageBanner.Title>{title}</PageBanner.Title>
            {description && <PageBanner.Description>{description}</PageBanner.Description>}
          </PageBanner.Body>
        </PageBanner.Content>
      </PageBanner.Root>
    </div>
  );
}

/**
 * 여러 계좌의 보유 종목 시세 기준을 보여주는 배너 (홈·계좌 목록처럼 계좌를 합쳐 보는 화면용).
 * 시세는 전역 캐시를 공유하므로 같은 종목을 다른 화면에서 이미 받았다면 추가 요청이 없다.
 */
export function HoldingsPriceAsOfBanner({ investments }: { investments: InvestmentItem[] }) {
  const holdings = useMemo(() => investments.flatMap((inv) => inv.holdings ?? []), [investments]);
  const { prices } = useStockPrices(holdings);
  return <PriceAsOfBanner prices={prices} />;
}
