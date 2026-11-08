"use client";

import type { StaticActivityComponentType } from "@stackflow/react";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { usePortfolioStore } from "@web/features/portfolio/stores/portfolio-store";
import { useRebalancingStore } from "@web/features/rebalancing/stores/rebalancing-store";
import { HomeMobile } from "../assets/_components/home-mobile";
import { InvestmentMobile } from "../assets/investments/_components/investment-mobile";
import { AccountDetailMobile } from "../assets/investments/[id]/_components/account-detail-mobile";
import { PortfolioListMobile } from "../assets/portfolio/_components/portfolio-list-mobile";
import { PortfolioDetailMobile } from "../assets/portfolio/[id]/_components/portfolio-detail-mobile";
import { RebalancingHomeMobile } from "../assets/rebalancing/_components/rebalancing-home-mobile";
import { RebalancingListMobile } from "../assets/rebalancing/_components/rebalancing-list-mobile";
import { RebalancingDetailMobile } from "../assets/rebalancing/[id]/_components/rebalancing-detail-mobile";
import { RebalancingSessionMobile } from "../assets/rebalancing/sessions/[id]/_components/rebalancing-session-mobile";
import { DetailScreen, TabScreen } from "./screens";

export const HomeTabActivity: StaticActivityComponentType<"HomeTab"> = () => (
  <TabScreen name="HomeTab">
    <HomeMobile />
  </TabScreen>
);

export const AccountsTabActivity: StaticActivityComponentType<"AccountsTab"> = () => (
  <TabScreen name="AccountsTab">
    <InvestmentMobile />
  </TabScreen>
);

export const RebalancingTabActivity: StaticActivityComponentType<"RebalancingTab"> = () => (
  <TabScreen name="RebalancingTab">
    <RebalancingHomeMobile />
  </TabScreen>
);

/** 새 리밸런싱: 계좌를 골라 계좌 리밸런싱 계산(`RebalancingDetail`)으로 들어간다. */
export const RebalancingNewActivity: StaticActivityComponentType<"RebalancingNew"> = () => (
  <DetailScreen title="새 리밸런싱">
    <RebalancingListMobile />
  </DetailScreen>
);

export const PortfolioTabActivity: StaticActivityComponentType<"PortfolioTab"> = () => (
  <TabScreen name="PortfolioTab">
    <PortfolioListMobile />
  </TabScreen>
);

/** 계좌 상세와 리밸런싱 상세는 계좌 단위라 같은 제목(계좌명·색·유형)을 쓴다. */
function AccountScreen({ id, children }: { id: string; children: React.ReactNode }) {
  // 계좌 객체 자체를 고른다 (새 객체를 만들지 않아 리렌더가 안정적).
  const account = useInvestmentStore((s) => s.investments.find((inv) => inv.id === id));
  return (
    <DetailScreen
      title={account?.accountName || "계좌"}
      subtitle={account?.accountType}
      dotColor={account?.color}
    >
      {children}
    </DetailScreen>
  );
}

// 함수 선언 + 명시 props 타입: `StaticActivityComponentType` 화살표 함수는
// eslint react/prop-types 가 props 타입을 읽지 못한다.
type DetailActivityProps = { params: { id: string } };

export function AccountDetailActivity({ params }: DetailActivityProps) {
  return (
    <AccountScreen id={params.id}>
      <AccountDetailMobile id={params.id} />
    </AccountScreen>
  );
}

export function RebalancingDetailActivity({ params }: DetailActivityProps) {
  return (
    <AccountScreen id={params.id}>
      <RebalancingDetailMobile id={params.id} />
    </AccountScreen>
  );
}

export function RebalancingSessionActivity({ params }: DetailActivityProps) {
  const session = useRebalancingStore((s) => s.sessions.find((x) => x.id === params.id));
  const account = useInvestmentStore((s) =>
    session ? s.investments.find((inv) => inv.id === session.accountId) : undefined
  );
  return (
    <DetailScreen
      title={account?.accountName || session?.accountName || "리밸런싱"}
      subtitle={session?.portfolioName}
      dotColor={account?.color}
    >
      <RebalancingSessionMobile id={params.id} />
    </DetailScreen>
  );
}

export function PortfolioDetailActivity({ params }: DetailActivityProps) {
  const portfolio = usePortfolioStore((s) => s.portfolios.find((p) => p.id === params.id));
  return (
    <DetailScreen title={portfolio?.name || "포트폴리오"} dotColor={portfolio?.color}>
      <PortfolioDetailMobile id={params.id} />
    </DetailScreen>
  );
}
