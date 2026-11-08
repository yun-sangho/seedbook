"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconChevronRightLine, IconPlusLine } from "@karrotmarket/react-monochrome-icon";
import { Divider, Icon } from "@seed-design/react";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { usePortfolioStore } from "@web/features/portfolio/stores/portfolio-store";
import { resolvePortfolioAccounts } from "@web/features/portfolio/utils/resolve-portfolio-accounts";
import { useIsReadOnly } from "@web/features/sharing/hooks/use-is-read-only";
import { ActionButton } from "@web/seed-design/ui/action-button";
import { Badge } from "@web/seed-design/ui/badge";
import { ResultSection } from "@web/seed-design/ui/result-section";

export function PortfolioListMobile() {
  const portfolios = usePortfolioStore((s) => s.portfolios);
  const addPortfolio = usePortfolioStore((s) => s.addPortfolio);
  const investments = useInvestmentStore((s) => s.investments);
  const readOnly = useIsReadOnly();
  const router = useRouter();

  const handleAdd = () => {
    const id = addPortfolio();
    router.push(`/assets/portfolio/${id}`);
  };

  if (portfolios.length === 0) {
    return (
      <div className="flex min-h-[60dvh] flex-col">
        <ResultSection
          title="포트폴리오가 없어요"
          description={
            readOnly
              ? "아직 등록된 포트폴리오가 없습니다."
              : "목표 비중을 정의하면 리밸런싱 탭에서 실제 보유와 비교할 수 있어요."
          }
          primaryActionProps={
            readOnly ? undefined : { children: "첫 포트폴리오 만들기", onClick: handleAdd }
          }
        />
      </div>
    );
  }

  return (
    // 카드 대신 한 장의 표면 위에 행을 나열하고 디바이더로 구분한다.
    <div className="pb-x4">
      <p className="t3-regular text-fg-neutral-subtle flex h-x12 items-center px-x4">
        {portfolios.length}개 포트폴리오
      </p>
      {portfolios.map((portfolio) => {
        const totalPct = portfolio.allocations.reduce((acc, a) => acc + (a.targetPercent || 0), 0);
        const scopedAccounts = resolvePortfolioAccounts(portfolio, investments);
        const linkEmpty = portfolio.accountIds.length === 0;
        const linkStale = !linkEmpty && scopedAccounts.length < portfolio.accountIds.length;

        return (
          <div key={portfolio.id}>
            <Divider inset />
            <Link
              href={`/assets/portfolio/${portfolio.id}`}
              className="active:bg-bg-layer-default-pressed flex items-center gap-x3 px-x4 py-x4"
            >
              <span
                className="size-x3 shrink-0 rounded-full"
                style={{ backgroundColor: portfolio.color }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="t5-bold truncate">{portfolio.name}</p>
                <p className="t3-regular text-fg-neutral-subtle mt-[2px] tabular-nums">
                  {portfolio.allocations.length}종목 ·{" "}
                  <span
                    className={
                      totalPct > 100
                        ? "text-fg-critical"
                        : totalPct < 100
                          ? "text-fg-warning"
                          : "text-fg-positive"
                    }
                  >
                    합계 {totalPct.toFixed(1)}%
                  </span>
                </p>
                <div className="mt-x2 flex flex-wrap gap-x1">
                  <Badge tone={linkEmpty || linkStale ? "warning" : "neutral"} variant="weak">
                    {linkEmpty
                      ? "연결 계좌 없음"
                      : `계좌 ${scopedAccounts.length}/${portfolio.accountIds.length}${linkStale ? " · 삭제된 계좌 포함" : ""}`}
                  </Badge>
                </div>
              </div>
              <Icon svg={<IconChevronRightLine />} size="x5" color="fg.neutralSubtle" />
            </Link>
          </div>
        );
      })}

      {!readOnly && (
        <>
          <Divider />
          <div className="flex justify-center pt-x4">
            <ActionButton variant="ghost" size="medium" onClick={handleAdd}>
              <Icon svg={<IconPlusLine />} />
              포트폴리오 추가
            </ActionButton>
          </div>
        </>
      )}
    </div>
  );
}
