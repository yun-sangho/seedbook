"use client";

import { useMemo } from "react";
import {
  IconChevronLeftLine,
  IconChevronRightLine,
  IconExclamationmarkCircleFill,
} from "@karrotmarket/react-monochrome-icon";
import { Divider, Icon } from "@seed-design/react";
import { PlantAvatar } from "@web/features/garden/components/plant-avatar";
import { PLANT_STAGES } from "@web/features/garden/plant-3d/plant-options";
import { gardenFocusSummary } from "@web/features/garden/utils/garden-home";
import type { InvestmentItem } from "@web/features/investments/types/types";
import type { StockPricePoint } from "@web/features/investments/utils/use-stock-prices";
import { PLANT_STAGE_LABELS } from "@web/features/portfolio/types/constants";
import type { PortfolioItem } from "@web/features/portfolio/types/types";
import type { PortfolioPlantView } from "@web/features/portfolio/utils/portfolio-plant-view";
import { ActionButton } from "@web/seed-design/ui/action-button";
import { ActionableCallout } from "@web/seed-design/ui/callout";
import { numberToKorean } from "@web/utils/number-format";

/**
 * 포커스한 식물의 요약 (평가 금액, 목표 대비, 다음 목표까지 남은 금액, 처짐, 리밸런싱 필요) 과 종목 목록
 * (목표 비중 → 지금 비중).
 */
export function GardenFocusPanel({
  plant,
  portfolio,
  investments,
  prices,
  onOverview,
  onSetGoal,
  onRebalance,
  onOpenPortfolio,
}: {
  plant: PortfolioPlantView;
  portfolio: PortfolioItem;
  investments: InvestmentItem[];
  prices: Map<string, StockPricePoint>;
  onOverview: () => void;
  onSetGoal: () => void;
  onRebalance: () => void;
  onOpenPortfolio: () => void;
}) {
  const summary = useMemo(
    () => gardenFocusSummary(plant, portfolio, investments, prices),
    [plant, portfolio, investments, prices]
  );
  const { row } = summary;

  return (
    <div className="pb-x4">
      <div className="flex items-center gap-x1 px-x2 pt-x2">
        <ActionButton variant="ghost" size="small" onClick={onOverview}>
          <Icon svg={<IconChevronLeftLine />} />
          정원 전체
        </ActionButton>
      </div>

      <section className="flex items-center gap-x3 px-x5 pt-x2 pb-x4">
        <PlantAvatar stage={PLANT_STAGES[row.stage]} pot={row.pot} size={52} />
        <div className="min-w-0 flex-1">
          <p className="t6-bold truncate">{row.name}</p>
          <p
            className={`t3-regular mt-[2px] ${row.drooping ? "text-fg-warning" : "text-fg-neutral-subtle"}`}
          >
            {PLANT_STAGE_LABELS[row.stage]}
            {row.drooping && " · 지난 목표보다 내려가 시들해요"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="t3-regular text-fg-neutral-subtle">평가 금액</p>
          <p className="t6-bold tabular-nums">
            {summary.linked ? numberToKorean(row.value ?? 0) || "0원" : "—"}
          </p>
        </div>
      </section>

      <div className="px-x4">
        <GoalCard summary={summary} onSetGoal={onSetGoal} />
      </div>

      {row.needsRebalance && (
        <div className="px-x4 pt-x3">
          <ActionableCallout
            tone="warning"
            prefixIcon={<IconExclamationmarkCircleFill />}
            title="리밸런싱이 필요해요"
            description="목표 비중에서 벗어난 종목이 있어요. 눌러서 리밸런싱해요."
            onClick={onRebalance}
          />
        </div>
      )}

      {!summary.linked && (
        <p className="t4-regular text-fg-neutral-subtle px-x5 pt-x3">
          연결된 계좌가 없어 금액이 0원이에요. 포트폴리오에서 계좌를 연결해 주세요.
        </p>
      )}

      <p className="t3-regular text-fg-neutral-subtle flex h-x10 items-center px-x4 pt-x4">
        종목 · 목표 비중 → 지금 비중
      </p>
      {summary.stocks.length === 0 ? (
        <p className="t4-regular text-fg-neutral-subtle px-x4 py-x3">아직 정한 종목이 없어요</p>
      ) : (
        summary.stocks.map((stock) => (
          <div key={stock.key}>
            <Divider inset />
            <div className="flex items-center gap-x3 px-x4 py-x3">
              <p className="t4-medium min-w-0 flex-1 truncate">{stock.name || stock.ticker}</p>
              <p className="t4-regular shrink-0 tabular-nums">
                <span className="text-fg-neutral-subtle">
                  {stock.targetPercent === null ? "목표 없음" : `${stock.targetPercent}%`}
                </span>
                {summary.linked && (
                  <>
                    <span className="text-fg-neutral-subtle"> → </span>
                    <span className="t4-bold">{stock.percent.toFixed(1)}%</span>
                  </>
                )}
              </p>
            </div>
          </div>
        ))
      )}
      <Divider />
      <div className="flex justify-center pt-x4">
        <ActionButton variant="ghost" size="medium" onClick={onOpenPortfolio}>
          포트폴리오 자세히 보기
          <Icon svg={<IconChevronRightLine />} />
        </ActionButton>
      </div>
    </div>
  );
}

function GoalCard({
  summary,
  onSetGoal,
}: {
  summary: ReturnType<typeof gardenFocusSummary>;
  onSetGoal: () => void;
}) {
  if (summary.goalState === "complete") {
    return (
      <div className="bg-bg-positive-weak rounded-r3 px-x4 py-x3">
        <p className="t4-bold">꽃·열매까지 다 자랐어요 🌸</p>
      </div>
    );
  }
  if (summary.goalState === "needs-goal") {
    const first = summary.row.stage === 0;
    return (
      <div className="bg-bg-brand-weak rounded-r3 flex items-center gap-x3 px-x4 py-x3">
        <div className="min-w-0 flex-1">
          <p className="t4-bold">
            {first ? "목표를 정하면 자라기 시작해요" : "목표를 달성했어요! 🎉"}
          </p>
          <p className="t3-regular text-fg-neutral-subtle mt-[2px]">
            {first
              ? "포트폴리오 금액이 목표에 닿으면 한 단계 자라요"
              : "다음 목표를 정하면 또 자라요"}
          </p>
        </div>
        <ActionButton size="small" onClick={onSetGoal}>
          {first ? "목표 정하기" : "다음 목표 정하기"}
        </ActionButton>
      </div>
    );
  }
  const percent = summary.goalPercent ?? 0;
  return (
    <div className="border-stroke-neutral-muted rounded-r3 border-2 px-x4 py-x3">
      <div className="flex items-center justify-between gap-x2">
        <p className="t4-regular text-fg-neutral-subtle">
          목표 {numberToKorean(summary.goalAmount ?? 0)}
        </p>
        <ActionButton
          variant="neutralWeak"
          size="xsmall"
          onClick={onSetGoal}
          aria-label="식물 목표 수정"
        >
          수정
        </ActionButton>
      </div>
      <div className="mt-x2 flex items-baseline justify-between gap-x2">
        <p className="t6-bold tabular-nums">{percent}%</p>
        <p className="t4-medium tabular-nums">
          다음 단계까지 {numberToKorean(summary.remainingToNextStage ?? 0) || "0원"}
        </p>
      </div>
      <div
        className="bg-bg-neutral-weak mt-x2 h-[8px] overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={Math.min(100, percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="목표 대비"
      >
        <div
          className="bg-bg-brand-solid h-full rounded-full"
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </div>
  );
}
