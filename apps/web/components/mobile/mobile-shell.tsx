"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconArrowUpArrowDownFill,
  IconArrowUpArrowDownLine,
  IconBarchartSquareFill,
  IconBarchartSquareLine,
  IconChevronLeftLine,
  IconDot3HorizontalLine,
  IconHouseFill,
  IconHouseLine,
  IconLinechartUpXaxisFill,
  IconLinechartUpXaxisLine,
} from "@karrotmarket/react-monochrome-icon";
import { Icon } from "@seed-design/react";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { usePortfolioStore } from "@web/features/portfolio/stores/portfolio-store";
import { SharedViewBanner } from "@web/features/sharing/components/shared-view-banner";
import { usePwaInstall } from "@web/hooks/use-pwa-install";
import { cn } from "@web/lib/utils";
import { HeaderActionSlotContext } from "./header-action";
import { MobileMoreSheet } from "./mobile-more-sheet";
import { ProfileButton, ProfileSheet } from "./profile-menu";

const TABS = [
  {
    href: "/assets",
    label: "홈",
    icon: <IconHouseLine />,
    activeIcon: <IconHouseFill />,
    // "/assets" 는 모든 화면의 prefix 라 정확히 일치할 때만 활성.
    exact: true,
  },
  {
    href: "/assets/investments",
    label: "계좌",
    icon: <IconLinechartUpXaxisLine />,
    activeIcon: <IconLinechartUpXaxisFill />,
  },
  {
    href: "/assets/rebalancing",
    label: "리밸런싱",
    icon: <IconArrowUpArrowDownLine />,
    activeIcon: <IconArrowUpArrowDownFill />,
  },
  {
    href: "/assets/portfolio",
    label: "포트폴리오",
    icon: <IconBarchartSquareLine />,
    activeIcon: <IconBarchartSquareFill />,
  },
] as const;

const PORTFOLIO_DETAIL = /^\/assets\/portfolio\/([^/]+)$/;
const REBALANCING_DETAIL = /^\/assets\/rebalancing\/([^/]+)$/;
const ACCOUNT_DETAIL = /^\/assets\/investments\/([^/]+)$/;

interface ScreenTitle {
  title: string;
  backHref: string | null;
  /** 제목 앞 색상 점 (계좌 색) */
  dotColor?: string;
  /** 제목 옆 보조 텍스트 (계좌 유형) */
  subtitle?: string;
}

function useScreenTitle(pathname: string): ScreenTitle {
  const portfolioId = pathname.match(PORTFOLIO_DETAIL)?.[1];
  const accountId = pathname.match(ACCOUNT_DETAIL)?.[1];
  // 리밸런싱 상세는 계좌 단위라 계좌 상세와 같은 제목(계좌명·색·유형)을 쓴다.
  const rebalancingAccountId = pathname.match(REBALANCING_DETAIL)?.[1];
  const titledAccountId = accountId ?? rebalancingAccountId;
  const portfolioName = usePortfolioStore((s) =>
    portfolioId ? s.portfolios.find((p) => p.id === portfolioId)?.name : undefined
  );
  // 계좌 객체 자체를 고른다 (새 객체를 만들지 않아 리렌더가 안정적).
  const account = useInvestmentStore((s) =>
    titledAccountId ? s.investments.find((inv) => inv.id === titledAccountId) : undefined
  );
  if (portfolioId) {
    return { title: portfolioName || "포트폴리오", backHref: "/assets/portfolio" };
  }
  if (titledAccountId) {
    return {
      title: account?.accountName || "계좌",
      backHref: accountId ? "/assets/investments" : "/assets/rebalancing",
      dotColor: account?.color,
      subtitle: account?.accountType,
    };
  }
  const tab = TABS.find((t) => t.href === pathname);
  return { title: tab?.label ?? "Seedbook", backHref: null };
}

/**
 * 모바일 앱 셸: 상단 앱바 + 하단 탭바. 홈·계좌·리밸런싱·포트폴리오만 노출한다.
 * 노치/홈 인디케이터 영역은 SEED safe-area 변수로 비워둔다.
 */
export function MobileShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { title, backHref, dotColor, subtitle } = useScreenTitle(pathname);
  const [moreOpen, setMoreOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [actionSlot, setActionSlot] = useState<HTMLElement | null>(null);
  const { mode: installMode, install, isIOS } = usePwaInstall();

  return (
    <HeaderActionSlotContext.Provider value={actionSlot}>
      <div
        className="bg-bg-layer-default text-fg-neutral flex min-h-dvh w-full flex-col"
        style={{ fontFamily: "var(--seed-font-family)" }}
      >
        <header
          className="bg-bg-layer-default border-stroke-neutral-subtle sticky top-0 z-[1] border-b"
          style={{ paddingTop: "var(--seed-safe-area-top)" }}
        >
          <div className="flex h-[52px] items-center gap-x1 px-x2">
            {backHref ? (
              <Link
                href={backHref}
                aria-label="뒤로"
                className="text-fg-neutral flex size-x10 items-center justify-center"
              >
                <Icon svg={<IconChevronLeftLine />} size="x6" />
              </Link>
            ) : (
              <span className="w-x2" />
            )}
            <div className="flex min-w-0 flex-1 items-center gap-x2">
              {dotColor && (
                <span
                  className="size-[10px] shrink-0 rounded-full"
                  style={{ backgroundColor: dotColor }}
                  aria-hidden
                />
              )}
              <h1 className="t6-bold min-w-0 truncate">{title}</h1>
              {subtitle && (
                <span className="t3-medium text-fg-neutral-subtle shrink-0">{subtitle}</span>
              )}
            </div>
            {/* 오른쪽: 상세 화면은 HeaderAction 슬롯("수정" 등), 하단 탭 최상위 화면은 계정 프로필. */}
            <div ref={setActionSlot} className="flex items-center pr-x2 empty:hidden" />
            {!backHref && (
              <div className="pr-x1">
                <ProfileButton onClick={() => setProfileOpen(true)} />
              </div>
            )}
          </div>
        </header>

        <SharedViewBanner />

        <main
          className="flex-1"
          // 하단 탭바(56px) + 홈 인디케이터만큼 여백.
          style={{ paddingBottom: "calc(56px + var(--seed-safe-area-bottom))" }}
        >
          {children}
        </main>

        <nav
          aria-label="주 메뉴"
          className="bg-bg-layer-default border-stroke-neutral-subtle fixed inset-x-0 bottom-0 z-[1] border-t"
          style={{ paddingBottom: "var(--seed-safe-area-bottom)" }}
        >
          <ul className="flex h-[56px]">
            {TABS.map((tab) => {
              const active =
                pathname === tab.href ||
                (!("exact" in tab && tab.exact) && pathname.startsWith(`${tab.href}/`));
              return (
                <li key={tab.href} className="flex-1">
                  <Link
                    href={tab.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "t2-medium flex h-full flex-col items-center justify-center gap-x1",
                      active ? "text-fg-neutral" : "text-fg-neutral-subtle"
                    )}
                  >
                    <Icon svg={active ? tab.activeIcon : tab.icon} size="x6" />
                    {tab.label}
                  </Link>
                </li>
              );
            })}
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                className="t2-medium text-fg-neutral-subtle flex h-full w-full flex-col items-center justify-center gap-x1"
              >
                <Icon svg={<IconDot3HorizontalLine />} size="x6" />
                더보기
              </button>
            </li>
          </ul>
        </nav>

        {/* 시트는 앱바/탭바 밖(셸 최상단)에 둬야 탭바에 가려지지 않는다. */}
        <ProfileSheet open={profileOpen} onOpenChange={setProfileOpen} />
        <MobileMoreSheet
          open={moreOpen}
          onOpenChange={setMoreOpen}
          installMode={installMode}
          onInstall={install}
          isIOS={isIOS}
        />
      </div>
    </HeaderActionSlotContext.Provider>
  );
}
