"use client";

import { type ReactNode, useCallback } from "react";
import { type StaticActivityComponentType, useFlow, useStepFlow } from "@stackflow/react";
import { LegalDocumentView } from "@web/components/legal-document-view";
import { LegalNoticeBanner } from "@web/components/mobile/legal-notice-banner";
import { ProfileEditor } from "@web/components/mobile/profile-menu";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { usePortfolioStore } from "@web/features/portfolio/stores/portfolio-store";
import { useRebalancingStore } from "@web/features/rebalancing/stores/rebalancing-store";
import { LEGAL_DOCUMENTS, type LegalDocumentId } from "@web/lib/legal-documents";
import { HomeMobile } from "../assets/_components/home-mobile";
import { InvestmentMobile } from "../assets/investments/_components/investment-mobile";
import { AccountDetailMobile } from "../assets/investments/[id]/_components/account-detail-mobile";
import { PortfolioListMobile } from "../assets/portfolio/_components/portfolio-list-mobile";
import { PortfolioDetailMobile } from "../assets/portfolio/[id]/_components/portfolio-detail-mobile";
import { RebalancingHomeMobile } from "../assets/rebalancing/_components/rebalancing-home-mobile";
import { RebalancingListMobile } from "../assets/rebalancing/_components/rebalancing-list-mobile";
import { RebalancingDetailMobile } from "../assets/rebalancing/[id]/_components/rebalancing-detail-mobile";
import { RebalancingSessionMobile } from "../assets/rebalancing/sessions/[id]/_components/rebalancing-session-mobile";
import { TradeEntryMobile } from "../assets/rebalancing/sessions/[id]/_components/trade-entry-mobile";
import { DataBackupMobile } from "../assets/settings/_components/data-backup-mobile";
import { DeleteAccountMobile } from "../assets/settings/_components/delete-account-mobile";
import { LoginMethodsMobile } from "../assets/settings/_components/login-methods-mobile";
import { SettingsMenuMobile } from "../assets/settings/_components/settings-menu-mobile";
import { StorageModeMobile } from "../assets/settings/_components/storage-mode-mobile";
import { legalActivityOf } from "./legal-activity";
import { DetailScreen, TabsScreen } from "./screens";
import { type TabKey, type TabsParams, tabOf } from "./tabs";

/** 탭마다 같은 엘리먼트를 써서, 탭을 바꿀 때 다른 탭 화면이 다시 그려지지 않게 한다. */
const TAB_SCREENS: Record<TabKey, ReactNode> = {
  home: (
    <>
      <LegalNoticeBanner />
      <HomeMobile />
    </>
  ),
  investments: <InvestmentMobile />,
  rebalancing: <RebalancingHomeMobile />,
  portfolio: <PortfolioListMobile />,
};

/** 정원 홈은 위쪽 정원 창을 고정하고 아래 목록만 스크롤한다. */
const FIXED_HEIGHT_TABS: readonly TabKey[] = ["home"];

export function TabsActivity({ params }: { params: TabsParams }) {
  return (
    <TabsScreen current={tabOf(params)} screens={TAB_SCREENS} fixedHeight={FIXED_HEIGHT_TABS} />
  );
}

/** 새 리밸런싱: 계좌를 골라 계좌 리밸런싱 계산(`RebalancingDetail`)으로 들어간다. */
export const RebalancingNewActivity: StaticActivityComponentType<"RebalancingNew"> = () => (
  <DetailScreen title="새 리밸런싱">
    <RebalancingListMobile />
  </DetailScreen>
);

/** 계좌 상세와 리밸런싱 상세는 계좌 단위라 같은 제목(계좌명·색·유형)을 쓴다. */
function AccountScreen({ id, children }: { id: string; children: ReactNode }) {
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

/** 리밸런싱 매매 하나의 체결 수량·가격 입력. 제목은 종목명, 부제는 계좌. */
export function RebalancingTradeActivity({ params }: { params: { id: string; taskId: string } }) {
  const session = useRebalancingStore((s) => s.sessions.find((x) => x.id === params.id));
  const task = session?.tasks.find((t) => t.id === params.taskId);
  const account = useInvestmentStore((s) =>
    session ? s.investments.find((inv) => inv.id === session.accountId) : undefined
  );
  return (
    <DetailScreen
      title={task ? task.name || task.ticker : "매매"}
      subtitle={account?.accountName || session?.accountName}
      dotColor={account?.color}
    >
      <TradeEntryMobile sessionId={params.id} taskId={params.taskId} />
    </DetailScreen>
  );
}

export function PortfolioDetailActivity({ params }: DetailActivityProps) {
  const portfolio = usePortfolioStore((s) => s.portfolios.find((p) => p.id === params.id));
  return (
    <DetailScreen title={portfolio?.name || "포트폴리오"}>
      <PortfolioDetailMobile id={params.id} />
    </DetailScreen>
  );
}

/** 앱바 프로필 버튼 → 설정 메뉴 (프로필 카드 + 앱·데이터·계정·정보). */
export function SettingsActivity() {
  return (
    <DetailScreen title="설정" basement>
      <SettingsMenuMobile />
    </DetailScreen>
  );
}

/** 설정 → 프로필 카드: 아바타·닉네임 편집. 저장하면 닫는다. */
export function ProfileActivity() {
  const { pop } = useFlow();
  return (
    <DetailScreen title="프로필">
      <ProfileEditor onSaved={() => pop()} />
    </DetailScreen>
  );
}

/**
 * 설정 → 이용약관 · 개인정보처리방침 (홈의 개정 안내 "자세히 보기" 도 여기로 push). 사이트 페이지
 * (`/terms`) 로 나가지 않고 스택 화면으로 열어 다른 설정 화면처럼 뒤로가기·스와이프로 돌아온다.
 * 다른 버전·본문 안 약관 링크는 그 문서 화면을 push.
 */
function LegalDocumentScreen({
  document,
  version,
}: {
  document: LegalDocumentId;
  version?: string;
}) {
  const { push } = useFlow();
  const title = LEGAL_DOCUMENTS.find((d) => d.id === document)?.title ?? "";
  return (
    <DetailScreen title={title}>
      <LegalDocumentView
        document={document}
        version={version}
        onOpen={(target) =>
          push(legalActivityOf(target.document), target.version ? { version: target.version } : {})
        }
      />
    </DetailScreen>
  );
}

export function TermsActivity({ params }: { params: { version?: string } }) {
  return <LegalDocumentScreen document="terms" version={params.version} />;
}

export function PrivacyActivity({ params }: { params: { version?: string } }) {
  return <LegalDocumentScreen document="privacy" version={params.version} />;
}

/** 설정 → 저장 위치 (이 기기 / 클라우드). */
export function StorageModeActivity() {
  return (
    <DetailScreen title="저장 위치">
      <StorageModeMobile />
    </DetailScreen>
  );
}

/** 설정 → 백업. */
export function DataBackupActivity() {
  return (
    <DetailScreen title="백업">
      <DataBackupMobile />
    </DetailScreen>
  );
}

/** 설정 → 탈퇴하기. */
export function DeleteAccountActivity() {
  return (
    <DetailScreen title="탈퇴하기">
      <DeleteAccountMobile />
    </DetailScreen>
  );
}

/** 설정 → 로그인 수단 (카카오·Apple 연결·해제). */
export const LoginMethodsActivity: StaticActivityComponentType<"LoginMethods"> = ({ params }) => {
  // 같은 화면에서 params 만 비워 주소의 결과 쿼리를 지운다 (다시 그려지지 않는다).
  const { replaceStep } = useStepFlow("LoginMethods");
  const clearReturnParams = useCallback(() => replaceStep({}), [replaceStep]);
  return (
    <DetailScreen title="로그인 수단">
      <LoginMethodsMobile returnParams={params} onReturnParamsShown={clearReturnParams} />
    </DetailScreen>
  );
};
