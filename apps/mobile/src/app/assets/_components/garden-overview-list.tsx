"use client";

import { useMemo } from "react";
import {
  IconArrowClockwiseCircularFill,
  IconCheckmarkCircleFill,
  IconPlusLine,
} from "@karrotmarket/react-monochrome-icon";
import { switchTab } from "@mobile/app/_stack/stack-control";
import { profitToneClass } from "@mobile/components/mobile/profit-tone";
import { GoalBar } from "@mobile/features/garden/components/goal-bar";
import { PlantAvatar } from "@mobile/features/garden/components/plant-avatar";
import { RebalanceMark } from "@mobile/features/garden/components/rebalance-mark";
import { PLANT_STAGES } from "@mobile/features/garden/plant-3d/plant-options";
import { type GardenRow, gardenRows } from "@mobile/features/garden/utils/garden-home";
import type { InvestmentItem } from "@mobile/features/investments/types/types";
import { summarizeAccounts } from "@mobile/features/investments/utils/summarize-accounts";
import { useLiveAccounts } from "@mobile/features/investments/utils/use-live-accounts";
import { PLANT_STAGE_LABELS } from "@mobile/features/portfolio/types/constants";
import type { PortfolioItem } from "@mobile/features/portfolio/types/types";
import type { PortfolioPlantView } from "@mobile/features/portfolio/utils/portfolio-plant-view";
import { useRebalancingHomeTab } from "@mobile/features/rebalancing/stores/rebalancing-home-tab-store";
import { useRebalancingStore } from "@mobile/features/rebalancing/stores/rebalancing-store";
import { inProgressBanner } from "@mobile/features/rebalancing/utils/in-progress-banner";
import { ActionButton } from "@mobile/seed-design/ui/action-button";
import { ActionableCallout } from "@mobile/seed-design/ui/callout";
import { ResultSection } from "@mobile/seed-design/ui/result-section";
import { formatReturnRate, numberToKorean } from "@mobile/utils/number-format";
import { formatProfitKorean } from "@mobile/utils/profit-color";
import { Divider, Icon } from "@seed-design/react";
import { useFlow } from "@stackflow/react";

/** 이름 옆 단계 + 시듦. */
function stageLabel(row: GardenRow): string {
  const stage = PLANT_STAGE_LABELS[row.stage];
  return row.drooping ? `${stage} · 시들해요` : stage;
}

/**
 * 바텀시트 머리: 총 평가금액·수익 (지금 시세로 다시 계산한 금액, 계좌 상세와 같은 값). 계좌가 없으면
 * 문구만.
 */
export function GardenTotalHeader({ investments }: { investments: InvestmentItem[] }) {
  const liveInvestments = useLiveAccounts(investments);
  const totals = useMemo(() => summarizeAccounts(liveInvestments), [liveInvestments]);
  return (
    <section className="px-x5 pt-x1 pb-x3">
      <p className="t4-medium text-fg-neutral-muted">총 평가금액</p>
      {investments.length > 0 ? (
        <div className="mt-x1 flex flex-wrap items-baseline gap-x-x2">
          <p className="t8-bold tabular-nums">{numberToKorean(totals.current) || "0원"}</p>
          <p className={`t4-medium tabular-nums ${profitToneClass(totals.profit)}`}>
            {formatProfitKorean(totals.profit)} ({formatReturnRate(totals.returnRate)})
          </p>
        </div>
      ) : (
        <p className="t8-bold mt-x1">0원</p>
      )}
    </section>
  );
}

/**
 * 정원 전체일 때의 목록: 총 평가금액·리밸런싱 이어하기, 그리고 포트폴리오 식물마다 한 행.
 * 행을 누르면 포트폴리오 상세로 간다. 포트폴리오가 없으면 첫 씨앗 심기.
 */
export function GardenOverviewList({
  plants,
  portfolios,
  investments,
  onOpenPortfolio,
  onPlantFirstSeed,
}: {
  plants: PortfolioPlantView[];
  portfolios: PortfolioItem[];
  investments: InvestmentItem[];
  onOpenPortfolio: (portfolioId: string) => void;
  onPlantFirstSeed: () => void;
}) {
  const { push } = useFlow();
  // 저장된 평가금액이 아니라 지금 시세로 다시 계산한 금액 (계좌 상세와 같은 값).
  const liveInvestments = useLiveAccounts(investments);
  const rows = useMemo(
    () => gardenRows(plants, portfolios, liveInvestments),
    [plants, portfolios, liveInvestments]
  );

  const sessions = useRebalancingStore((s) => s.sessions);
  const resumeBanner = useMemo(
    () => inProgressBanner(sessions, new Map(investments.map((inv) => [inv.id, inv.accountName]))),
    [sessions, investments]
  );
  const showInProgressList = useRebalancingHomeTab((s) => s.setTab);
  const resume = () => {
    if (resumeBanner?.sessionId) {
      push("RebalancingSession", { id: resumeBanner.sessionId });
      return;
    }
    showInProgressList("in-progress");
    switchTab("rebalancing");
  };

  return (
    <div className="pb-x4">
      {resumeBanner && (
        <div className="px-x4 pb-x3">
          <ActionableCallout
            tone={resumeBanner.readyToComplete ? "positive" : "informative"}
            prefixIcon={
              resumeBanner.readyToComplete ? (
                <IconCheckmarkCircleFill />
              ) : (
                <IconArrowClockwiseCircularFill />
              )
            }
            title={resumeBanner.title}
            description={resumeBanner.description}
            onClick={resume}
          />
        </div>
      )}

      {rows.length === 0 ? (
        <ResultSection
          title="첫 씨앗을 심어 보세요"
          description="포트폴리오를 만들면 정원에 씨앗이 심겨요. 목표 금액을 정하면 자라기 시작해요."
          primaryActionProps={{ children: "첫 씨앗 심기", onClick: onPlantFirstSeed }}
        />
      ) : (
        <>
          <p className="t3-regular text-fg-neutral-subtle flex h-x10 items-center px-x4">
            {rows.length}개 포트폴리오
          </p>
          {rows.map((row) => (
            <div key={row.portfolioId}>
              <Divider inset />
              <button
                type="button"
                onClick={() => onOpenPortfolio(row.portfolioId)}
                aria-label={`${row.name} 포트폴리오 보기`}
                className="active:bg-bg-layer-default-pressed flex w-full items-center gap-x3 px-x4 py-x3 text-left"
              >
                <span className="relative shrink-0">
                  <PlantAvatar
                    stage={PLANT_STAGES[row.stage]}
                    pot={row.pot}
                    kind={row.kind}
                    size={44}
                  />
                  {row.needsRebalance && (
                    <span className="absolute -top-[2px] -right-[2px]">
                      <RebalanceMark size={16} />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-baseline gap-x1_5">
                    <span className="t5-bold truncate">{row.name}</span>
                    <span
                      className={`t3-regular shrink-0 ${row.drooping ? "text-fg-warning" : "text-fg-neutral-subtle"}`}
                    >
                      {stageLabel(row)}
                    </span>
                  </span>
                  <GoalBar
                    className="mt-x1_5"
                    stage={row.stage}
                    goalState={row.goalState}
                    goalPercent={row.goalPercent}
                    drooping={row.drooping}
                    ariaLabel={`${row.name} 목표 도달`}
                  />
                </span>
                <span className="shrink-0 pl-x2 text-right">
                  {row.value === null ? (
                    <span className="t3-regular text-fg-neutral-subtle">연결 계좌 없음</span>
                  ) : (
                    <>
                      <span className="t5-bold block tabular-nums">
                        {numberToKorean(row.value) || "0원"}
                      </span>
                      {row.returnRate !== null && (
                        <span
                          className={`t3-medium mt-[2px] block tabular-nums ${profitToneClass(row.returnRate)}`}
                        >
                          {formatReturnRate(row.returnRate)}
                        </span>
                      )}
                    </>
                  )}
                </span>
              </button>
            </div>
          ))}
          <Divider />
          <div className="flex justify-center pt-x4">
            <ActionButton variant="ghost" size="medium" onClick={onPlantFirstSeed}>
              <Icon svg={<IconPlusLine />} />
              씨앗 심기 (포트폴리오 추가)
            </ActionButton>
          </div>
        </>
      )}
    </div>
  );
}
