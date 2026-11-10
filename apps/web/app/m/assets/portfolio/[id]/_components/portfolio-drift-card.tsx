"use client";

import {
  IconCheckmarkCircleFill,
  IconExclamationmarkCircleFill,
} from "@karrotmarket/react-monochrome-icon";
import { Icon } from "@seed-design/react";
import type { PortfolioItem } from "@web/features/portfolio/types/types";
import {
  describeDriftRule,
  driftRuleExample,
  exampleTargetPercent,
} from "@web/features/portfolio/utils/drift-percent";
import type { PortfolioDriftSummary } from "@web/features/portfolio/utils/summarize-portfolio-drift";
import { cn } from "@web/lib/utils";
import { ActionButton } from "@web/seed-design/ui/action-button";

/**
 * 포트폴리오 상세 상단의 이격 카드: 위에는 경고 기준(문장), 아래에는 연결 계좌의 현재 상태.
 * 연결 계좌가 없으면 상태 줄은 생략한다.
 */
export function PortfolioDriftCard({
  portfolio,
  summary,
  linkedCount,
  onEdit,
}: {
  portfolio: PortfolioItem;
  summary: PortfolioDriftSummary;
  linkedCount: number;
  onEdit: () => void;
}) {
  return (
    <div className="border-stroke-neutral-muted rounded-r3 mt-x4 border-2 px-x4 py-x3">
      <div className="flex items-center justify-between gap-x2">
        <div className="min-w-0">
          <p className="t3-regular text-fg-neutral-subtle">이격 경고 기준</p>
          <p className="t5-bold mt-[2px] tabular-nums">{describeDriftRule(portfolio)}</p>
          <DriftRuleExample
            rule={portfolio}
            targetPercent={exampleTargetPercent(portfolio.allocations)}
            className="t3-regular text-fg-neutral-subtle mt-[2px]"
          />
        </div>
        <ActionButton
          variant="neutralWeak"
          size="xsmall"
          onClick={onEdit}
          aria-label="이격 경고 수정"
        >
          수정
        </ActionButton>
      </div>
      {linkedCount > 0 && (
        <div className="border-stroke-neutral-muted mt-x3 border-t pt-x3">
          <DriftStatusLine summary={summary} />
        </div>
      )}
    </div>
  );
}

/**
 * 기준을 실제 숫자로 푼 예시 한 줄 ("목표 20% → 17%~23% 밖이면 경고").
 * `highlight` 면 허용 범위를 강조색으로 보여준다 (시트). 좁은 화면에서도 두 줄로 넘치지 않게 말줄임한다.
 * 카드와 이격 경고 시트가 같이 쓴다.
 */
export function DriftRuleExample({
  rule,
  targetPercent,
  highlight = false,
  className,
}: {
  rule: Pick<PortfolioItem, "driftMode" | "driftThresholdPercent">;
  targetPercent: number;
  highlight?: boolean;
  className?: string;
}) {
  const { target, range } = driftRuleExample(rule, targetPercent);
  const rangeClass = highlight ? "text-fg-brand font-bold" : undefined;
  return (
    <p className={cn("truncate tabular-nums", className)}>
      <span>
        목표 {target} →{" "}
        {range === null ? (
          <span className={rangeClass}>조금만 벗어나도</span>
        ) : (
          <>
            <span className={rangeClass}>{range}</span> 밖이면
          </>
        )}{" "}
        경고
      </span>
    </p>
  );
}

function DriftStatusLine({ summary }: { summary: PortfolioDriftSummary }) {
  if (summary.breachedCount > 0) {
    return (
      <div className="flex items-center gap-x2">
        <Icon svg={<IconExclamationmarkCircleFill />} size="x4" color="fg.warning" />
        <p className="t4-bold text-fg-warning">계좌 {summary.breachedCount}개 리밸런싱 필요</p>
      </div>
    );
  }
  if (summary.okCount > 0) {
    return (
      <div className="flex items-center gap-x2">
        <Icon svg={<IconCheckmarkCircleFill />} size="x4" color="fg.positive" />
        <p className="t4-bold text-fg-positive">연결 계좌 모두 기준 이내</p>
      </div>
    );
  }
  return (
    <p className="t4-regular text-fg-neutral-subtle">
      보유 종목이나 시세가 없어 아직 판단할 수 없어요
    </p>
  );
}
