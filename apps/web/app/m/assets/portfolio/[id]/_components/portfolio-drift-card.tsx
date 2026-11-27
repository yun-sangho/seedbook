"use client";

import type { PortfolioItem } from "@web/features/portfolio/types/types";
import {
  describeDriftRuleShort,
  driftRuleExample,
} from "@web/features/portfolio/utils/drift-percent";
import type { PortfolioDriftSummary } from "@web/features/portfolio/utils/summarize-portfolio-drift";
import { cn } from "@web/lib/utils";
import { ActionButton } from "@web/seed-design/ui/action-button";
import { Badge } from "@web/seed-design/ui/badge";

/**
 * 포트폴리오 상세 상단 요약의 이격 한 줄: 경고 기준(짧게) + 연결 계좌의 지금 상태.
 * 기준을 숫자로 푼 예시는 수정 시트가 보여준다. 연결 계좌가 없으면 상태는 생략한다.
 */
export function PortfolioDriftRow({
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
    <div className="flex min-h-x12 items-center gap-x2 py-x2">
      <p className="t4-medium min-w-0 flex-1 truncate tabular-nums">
        <span className="text-fg-neutral-subtle font-normal">이격 </span>
        {describeDriftRuleShort(portfolio)}
      </p>
      {linkedCount > 0 && <DriftStatusBadge summary={summary} />}
      <ActionButton
        variant="neutralWeak"
        size="xsmall"
        onClick={onEdit}
        aria-label="이격 경고 수정"
      >
        수정
      </ActionButton>
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

/** 연결 계좌의 이격 상태를 짧은 배지로. 판단할 수 있는 계좌가 없으면 표시하지 않는다. */
function DriftStatusBadge({ summary }: { summary: PortfolioDriftSummary }) {
  if (summary.breachedCount > 0) {
    return (
      <Badge tone="warning" variant="weak" className="shrink-0">
        리밸런싱 필요 {summary.breachedCount}
      </Badge>
    );
  }
  if (summary.okCount > 0) {
    return (
      <Badge tone="positive" variant="weak" className="shrink-0">
        정상
      </Badge>
    );
  }
  return null;
}
