"use client";

import { useFlow } from "@stackflow/react";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { usePortfolioStore } from "@web/features/portfolio/stores/portfolio-store";
import { ResultSection } from "@web/seed-design/ui/result-section";
import { AccountRebalancingMobile } from "./account-rebalancing-mobile";

/**
 * 계좌 리밸런싱 상세. 계좌에 연결된 포트폴리오의 목표 비중으로 이 계좌를 맞춘다.
 */
export function RebalancingDetailMobile({ id }: { id: string }) {
  const account = useInvestmentStore((s) => s.investments.find((inv) => inv.id === id));
  // 한 계좌는 하나의 포트폴리오에만 연결된다 (`portfolio-links.ts`).
  const portfolio = usePortfolioStore((s) => s.portfolios.find((p) => p.accountIds.includes(id)));
  const { push, pop } = useFlow();

  if (!account) {
    return (
      <div className="flex min-h-[60dvh] flex-col">
        <ResultSection
          title="계좌를 찾을 수 없어요"
          description="삭제되었거나 잘못된 링크일 수 있습니다."
          primaryActionProps={{
            children: "리밸런싱 목록으로",
            onClick: () => pop(),
          }}
        />
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="flex min-h-[60dvh] flex-col">
        <ResultSection
          title="연결된 포트폴리오가 없어요"
          description="포트폴리오의 적용 계좌에 이 계좌를 추가하면 목표 비중대로 리밸런싱할 수 있어요."
          primaryActionProps={{
            children: "포트폴리오로 이동",
            onClick: () => push("PortfolioTab", {}),
          }}
        />
      </div>
    );
  }

  return (
    <div className="pb-x4">
      {portfolio.allocations.length === 0 ? (
        <div className="flex min-h-[50dvh] flex-col">
          <ResultSection
            title="목표 비중이 없어요"
            description={`"${portfolio.name}" 포트폴리오에서 목표 종목과 비중을 먼저 설정해주세요.`}
            primaryActionProps={{
              children: "포트폴리오 설정으로",
              onClick: () => push("PortfolioDetail", { id: portfolio.id }),
            }}
          />
        </div>
      ) : (
        // 연결 포트폴리오가 바뀌면 현금 시뮬레이션 입력을 초기화한다.
        <AccountRebalancingMobile key={portfolio.id} portfolio={portfolio} account={account} />
      )}
    </div>
  );
}
