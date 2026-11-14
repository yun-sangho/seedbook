"use client";

import { useMemo } from "react";
import { IconChevronRightLine, IconPlusLine } from "@karrotmarket/react-monochrome-icon";
import { Divider, Icon } from "@seed-design/react";
import { useFlow } from "@stackflow/react";
import { HoldingsPriceAsOfBanner } from "@web/components/mobile/price-as-of-banner";
import { profitToneClass } from "@web/components/mobile/profit-tone";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { summarizeAccounts } from "@web/features/investments/utils/summarize-accounts";
import { useLiveAccounts } from "@web/features/investments/utils/use-live-accounts";
import { usePortfolioStore } from "@web/features/portfolio/stores/portfolio-store";
import { resolvePortfolioAccounts } from "@web/features/portfolio/utils/resolve-portfolio-accounts";
import { ActionButton } from "@web/seed-design/ui/action-button";
import { Badge } from "@web/seed-design/ui/badge";
import { ResultSection } from "@web/seed-design/ui/result-section";
import { formatReturnRate, numberToKorean } from "@web/utils/number-format";
import { formatProfitKorean } from "@web/utils/profit-color";

export function PortfolioListMobile() {
  const portfolios = usePortfolioStore((s) => s.portfolios);
  const addPortfolio = usePortfolioStore((s) => s.addPortfolio);
  const storedInvestments = useInvestmentStore((s) => s.investments);
  // 저장된 평가금액이 아니라 지금 시세로 다시 계산한 금액을 보여준다 (계좌 상세와 같은 값).
  const investments = useLiveAccounts(storedInvestments);
  const { push } = useFlow();
  // 목록의 금액은 포트폴리오에 연결된 계좌로 계산하므로, 가격 기준도 그 계좌들로 알린다.
  const linkedAccounts = useMemo(() => {
    const linkedIds = new Set(portfolios.flatMap((p) => p.accountIds));
    return investments.filter((inv) => linkedIds.has(inv.id));
  }, [portfolios, investments]);

  const handleAdd = () => {
    const id = addPortfolio();
    push("PortfolioDetail", { id });
  };

  if (portfolios.length === 0) {
    return (
      <div className="flex min-h-[60dvh] flex-col">
        <ResultSection
          title="포트폴리오가 없어요"
          description="목표 비중을 정의하면 리밸런싱 탭에서 실제 보유와 비교할 수 있어요."
          primaryActionProps={{ children: "첫 포트폴리오 만들기", onClick: handleAdd }}
        />
      </div>
    );
  }

  return (
    // 카드 대신 한 장의 표면 위에 행을 나열하고 디바이더로 구분한다.
    <div className="pb-x4">
      <HoldingsPriceAsOfBanner investments={linkedAccounts} />
      <p className="t3-regular text-fg-neutral-subtle flex h-x12 items-center px-x4">
        {portfolios.length}개 포트폴리오
      </p>
      {portfolios.map((portfolio) => {
        const scopedAccounts = resolvePortfolioAccounts(portfolio, investments);
        // 삭제된 계좌는 연결 목록에 남아 있어도 세지 않는다.
        const linkEmpty = scopedAccounts.length === 0;
        // 연결 계좌의 평가금액·수익률 합 (홈·포트폴리오 상세와 같은 계산).
        const totals = summarizeAccounts(scopedAccounts);

        return (
          <div key={portfolio.id}>
            <Divider inset />
            <button
              type="button"
              onClick={() => push("PortfolioDetail", { id: portfolio.id })}
              className="active:bg-bg-layer-default-pressed flex w-full items-center gap-x3 px-x4 py-x4 text-left"
            >
              <span
                className="size-x3 shrink-0 rounded-full"
                style={{ backgroundColor: portfolio.color }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="t5-bold truncate">{portfolio.name}</p>
                <div className="mt-x2 flex flex-wrap gap-x1">
                  <Badge tone="neutral" variant="weak">
                    {portfolio.allocations.length}종목
                  </Badge>
                  <Badge tone={linkEmpty ? "warning" : "neutral"} variant="weak">
                    {linkEmpty ? "연결 계좌 없음" : `계좌 ${scopedAccounts.length}개`}
                  </Badge>
                </div>
              </div>
              {!linkEmpty && (
                <div className="shrink-0 text-right">
                  <p className="t5-bold tabular-nums">{numberToKorean(totals.current) || "0원"}</p>
                  <p className={`t3-medium tabular-nums ${profitToneClass(totals.profit)}`}>
                    {formatProfitKorean(totals.profit)} ({formatReturnRate(totals.returnRate)})
                  </p>
                </div>
              )}
              <Icon svg={<IconChevronRightLine />} size="x5" color="fg.neutralSubtle" />
            </button>
          </div>
        );
      })}

      <Divider />
      <div className="flex justify-center pt-x4">
        <ActionButton variant="ghost" size="medium" onClick={handleAdd}>
          <Icon svg={<IconPlusLine />} />
          포트폴리오 추가
        </ActionButton>
      </div>
    </div>
  );
}
