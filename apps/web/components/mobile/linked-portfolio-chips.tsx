"use client";

import Link from "next/link";
import {
  IconChevronRightSmallLine,
  IconExclamationmarkCircleFill,
} from "@karrotmarket/react-monochrome-icon";
import { Icon } from "@seed-design/react";
import type { LinkedPortfolioStatus } from "@web/features/portfolio/utils/linked-portfolio-status";
import { cn } from "@web/lib/utils";

/**
 * 계좌 카드 안의 "연결된 포트폴리오" 줄. 리밸런싱이 필요한 포트폴리오는
 * 빨간 강조로, 나머지는 중립 톤으로 보여주고 탭하면 해당 포트폴리오로 이동한다.
 */
export function LinkedPortfolioChips({
  statuses,
  showEmpty = false,
}: {
  statuses: LinkedPortfolioStatus[];
  /** 연결된 포트폴리오가 없을 때도 "없음" 안내를 보여줄지. */
  showEmpty?: boolean;
}) {
  if (statuses.length === 0) {
    return showEmpty ? (
      <p className="t3-regular text-fg-neutral-subtle px-x4 pb-x4">연결된 포트폴리오 없음</p>
    ) : null;
  }

  return (
    <div className="flex flex-wrap gap-[6px] px-x4 pb-x4">
      {statuses.map((s) => {
        const alert = s.state === "needs-rebalancing";
        return (
          <Link
            key={s.portfolioId}
            href={`/assets/portfolio/${s.portfolioId}`}
            className={cn(
              "t3-medium inline-flex max-w-full items-center gap-x1 rounded-full py-x1 pr-[6px] pl-x2.5",
              alert
                ? "bg-bg-critical-weak text-fg-critical active:bg-bg-critical-weak-pressed"
                : "bg-bg-neutral-weak text-fg-neutral-muted active:bg-bg-neutral-weak-pressed"
            )}
          >
            {alert ? (
              <Icon svg={<IconExclamationmarkCircleFill />} size="x3_5" />
            ) : (
              <span
                className="size-x2 shrink-0 rounded-full"
                style={{ backgroundColor: s.color }}
                aria-hidden
              />
            )}
            <span className="truncate">{s.name}</span>
            {alert && <span className="shrink-0">· 리밸런싱 필요 {s.breachedCount}건</span>}
            {s.state === "ok" && <span className="text-fg-neutral-subtle shrink-0">· 정상</span>}
            <Icon svg={<IconChevronRightSmallLine />} size="x3_5" />
          </Link>
        );
      })}
    </div>
  );
}
