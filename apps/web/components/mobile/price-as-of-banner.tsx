"use client";

import { useMemo } from "react";
import { IconClockLine } from "@karrotmarket/react-monochrome-icon";
import { PageBanner, PrefixIcon } from "@seed-design/react";
import type { InvestmentItem } from "@web/features/investments/types/types";
import { describePriceAsOf, summarizePriceAsOf } from "@web/features/investments/utils/price-as-of";
import {
  useStockPrices,
  type StockPricePoint,
} from "@web/features/investments/utils/use-stock-prices";

/**
 * 시세로 계산한 금액이 "언제 가격 기준인지" 를 화면 상단에 항상 보여주는 배너.
 * 장중이면 실시간 (마지막 체결 시각), 아니면 종가 (거래일) 를 표시한다.
 * 받은 시세가 하나도 없으면 아무것도 그리지 않는다.
 *
 * @see https://seed-design.io/react/components/page-banner
 */
export function PriceAsOfBanner({ prices }: { prices: ReadonlyMap<string, StockPricePoint> }) {
  const summary = useMemo(() => summarizePriceAsOf(prices.values()), [prices]);
  if (!summary) return null;

  // prices 는 70초마다 새로 받으므로 "오늘" 판정용 now 도 그때마다 갱신된다.
  const label = describePriceAsOf(summary, new Date());

  return (
    <PageBanner.Root variant="weak" tone={label.tone} role="status" aria-live="polite">
      <PrefixIcon svg={<IconClockLine />} />
      <PageBanner.Content>
        <PageBanner.Body>
          <PageBanner.Title>{label.title}</PageBanner.Title>
          {label.description && (
            <PageBanner.Description>{label.description}</PageBanner.Description>
          )}
        </PageBanner.Body>
      </PageBanner.Content>
    </PageBanner.Root>
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
