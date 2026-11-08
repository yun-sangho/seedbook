"use client";

import {
  IconChevronRightSmallLine,
  IconExclamationmarkCircleFill,
} from "@karrotmarket/react-monochrome-icon";
import { Icon } from "@seed-design/react";
import { useFlow } from "@stackflow/react";
import type { LinkedPortfolioStatus } from "@web/features/portfolio/utils/linked-portfolio-status";
import { cn } from "@web/lib/utils";

/**
 * 계좌 카드 안의 "연결된 포트폴리오" 칩. 리밸런싱이 필요하면 빨간 강조로, 아니면
 * 중립 톤으로 보여주고 탭하면 이 계좌의 리밸런싱 화면으로 이동한다.
 */
export function LinkedPortfolioChip({
  accountId,
  status,
  showEmpty = false,
}: {
  /** 칩을 누르면 이 계좌의 리밸런싱 상세로 이동한다. */
  accountId: string;
  status: LinkedPortfolioStatus | null;
  /** 연결된 포트폴리오가 없을 때도 "없음" 안내를 보여줄지. */
  showEmpty?: boolean;
}) {
  const { push } = useFlow();

  if (!status) {
    return showEmpty ? (
      <p className="t3-regular text-fg-neutral-subtle px-x4 pb-x4">연결된 포트폴리오 없음</p>
    ) : null;
  }

  const alert = status.state === "needs-rebalancing";
  return (
    <div className="flex px-x4 pb-x4">
      <button
        type="button"
        onClick={() => push("RebalancingDetail", { id: accountId })}
        className={cn(
          "t3-medium inline-flex max-w-full items-center gap-x1 rounded-full py-x1 pr-[6px] pl-x2.5",
          alert
            ? "bg-bg-warning-weak text-fg-warning active:bg-bg-warning-weak-pressed"
            : "bg-bg-neutral-weak text-fg-neutral-muted active:bg-bg-neutral-weak-pressed"
        )}
      >
        {alert ? (
          <Icon svg={<IconExclamationmarkCircleFill />} size="x3_5" />
        ) : (
          <span
            className="size-x2 shrink-0 rounded-full"
            style={{ backgroundColor: status.color }}
            aria-hidden
          />
        )}
        <span className="truncate">{status.name}</span>
        {alert && <span className="shrink-0">· 리밸런싱 필요 {status.breachedCount}건</span>}
        {status.state === "ok" && <span className="text-fg-neutral-subtle shrink-0">· 정상</span>}
        <Icon svg={<IconChevronRightSmallLine />} size="x3_5" />
      </button>
    </div>
  );
}
