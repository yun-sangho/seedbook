"use client";

import {
  IconChevronRightSmallLine,
  IconExclamationmarkCircleFill,
} from "@karrotmarket/react-monochrome-icon";
import { Icon } from "@seed-design/react";
import { useFlow } from "@stackflow/react";
import type { LinkedPortfolioStatus } from "@web/features/portfolio/utils/linked-portfolio-status";
import { useRebalancingStore } from "@web/features/rebalancing/stores/rebalancing-store";
import { findInProgressForAccount } from "@web/features/rebalancing/utils/rebalancing-session";
import { cn } from "@web/lib/utils";

const CHIP_TONE_CLASS = {
  progress: "bg-bg-positive-weak text-fg-positive active:bg-bg-positive-weak-pressed",
  alert: "bg-bg-warning-weak text-fg-warning active:bg-bg-warning-weak-pressed",
  neutral: "bg-bg-neutral-weak text-fg-neutral-muted active:bg-bg-neutral-weak-pressed",
} as const;

type ChipTone = keyof typeof CHIP_TONE_CLASS;

/** 진행 중이면 이격 여부보다 진행 상황이 우선이다. */
function chipTone(status: LinkedPortfolioStatus, inProgress: boolean): ChipTone {
  if (inProgress) return "progress";
  if (status.state === "needs-rebalancing") return "alert";
  return "neutral";
}

/**
 * 계좌 카드 안의 "연결된 포트폴리오" 칩. 탭하면 이 계좌의 리밸런싱 화면으로 이동한다.
 * - 진행 중인 리밸런싱이 있으면 "리밸런싱 진행 중" 으로 보여주고 그 할 일 목록으로 바로 간다.
 * - 리밸런싱이 필요하면 경고 톤, 아니면 중립 톤.
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
  const inProgress = useRebalancingStore((s) => findInProgressForAccount(s.sessions, accountId));

  if (!status) {
    return showEmpty ? (
      <p className="t3-regular text-fg-neutral-subtle px-x4 pb-x4">연결된 포트폴리오 없음</p>
    ) : null;
  }

  const tone = chipTone(status, inProgress !== undefined);
  return (
    <div className="flex px-x4 pb-x4">
      <button
        type="button"
        onClick={() =>
          inProgress
            ? push("RebalancingSession", { id: inProgress.id })
            : push("RebalancingDetail", { id: accountId })
        }
        className={cn(
          "t3-medium inline-flex max-w-full items-center gap-x1 rounded-full py-x1 pr-[6px] pl-x2.5",
          CHIP_TONE_CLASS[tone]
        )}
      >
        {tone === "alert" ? (
          <Icon svg={<IconExclamationmarkCircleFill />} size="x3_5" />
        ) : (
          <span
            className="size-x2 shrink-0 rounded-full"
            style={{ backgroundColor: status.color }}
            aria-hidden
          />
        )}
        <span className="truncate">{status.name}</span>
        {tone === "progress" && <span className="shrink-0">· 리밸런싱 진행 중</span>}
        {tone === "alert" && <span className="shrink-0">· 리밸런싱 필요</span>}
        {tone === "neutral" && status.state === "ok" && (
          <span className="text-fg-neutral-subtle shrink-0">· 정상</span>
        )}
        <Icon svg={<IconChevronRightSmallLine />} size="x3_5" />
      </button>
    </div>
  );
}
