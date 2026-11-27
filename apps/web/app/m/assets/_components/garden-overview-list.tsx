"use client";

import { useMemo } from "react";
import {
  IconArrowClockwiseCircularFill,
  IconCheckmarkCircleFill,
  IconPlusLine,
} from "@karrotmarket/react-monochrome-icon";
import { Divider, Icon } from "@seed-design/react";
import { useFlow } from "@stackflow/react";
import { switchTab } from "@web/app/m/_stack/stack-control";
import { profitToneClass } from "@web/components/mobile/profit-tone";
import { PlantAvatar } from "@web/features/garden/components/plant-avatar";
import { PLANT_STAGES, REBALANCE_BADGE_COLOR } from "@web/features/garden/plant-3d/plant-options";
import { type GardenRow, gardenRows } from "@web/features/garden/utils/garden-home";
import type { InvestmentItem } from "@web/features/investments/types/types";
import { summarizeAccounts } from "@web/features/investments/utils/summarize-accounts";
import { useLiveAccounts } from "@web/features/investments/utils/use-live-accounts";
import { PLANT_STAGE_LABELS } from "@web/features/portfolio/types/constants";
import type { PortfolioItem } from "@web/features/portfolio/types/types";
import type { PortfolioPlantView } from "@web/features/portfolio/utils/portfolio-plant-view";
import { useRebalancingHomeTab } from "@web/features/rebalancing/stores/rebalancing-home-tab-store";
import { useRebalancingStore } from "@web/features/rebalancing/stores/rebalancing-store";
import { inProgressBanner } from "@web/features/rebalancing/utils/in-progress-banner";
import { ActionButton } from "@web/seed-design/ui/action-button";
import { ActionableCallout } from "@web/seed-design/ui/callout";
import { ResultSection } from "@web/seed-design/ui/result-section";
import { formatReturnRate, numberToKorean } from "@web/utils/number-format";
import { formatProfitKorean } from "@web/utils/profit-color";

/** 리밸런싱이 필요한 식물 표시 — 정원의 `!` 배지와 같은 모양 (작은 원형 !). */
export function RebalanceMark({ size = 18 }: { size?: number }) {
  return (
    <span
      role="img"
      aria-label="리밸런싱 필요"
      className="inline-flex shrink-0 items-center justify-center rounded-full border-[1.5px] border-white font-bold leading-none text-white"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.62),
        backgroundColor: REBALANCE_BADGE_COLOR,
      }}
    >
      !
    </span>
  );
}

function rowCaption(row: GardenRow): string {
  const stage = PLANT_STAGE_LABELS[row.stage];
  // 목표 정하기는 포커스 요약에서 한다. 목록은 금액·수익률을 먼저 보인다.
  if (row.needsGoal) return row.stage === 0 ? stage : `${stage} · 목표 달성!`;
  return row.drooping ? `${stage} · 시들해요` : stage;
}

/**
 * 정원 전체일 때의 목록: 총 평가금액·리밸런싱 이어하기, 그리고 포트폴리오 식물마다 한 행.
 * 행을 누르면 그 식물로 다가간다. 포트폴리오가 없으면 첫 씨앗 심기.
 */
export function GardenOverviewList({
  plants,
  portfolios,
  investments,
  onFocus,
  onPlantFirstSeed,
}: {
  plants: PortfolioPlantView[];
  portfolios: PortfolioItem[];
  investments: InvestmentItem[];
  onFocus: (portfolioId: string) => void;
  onPlantFirstSeed: () => void;
}) {
  const { push } = useFlow();
  // 저장된 평가금액이 아니라 지금 시세로 다시 계산한 금액 (계좌 상세와 같은 값).
  const liveInvestments = useLiveAccounts(investments);
  const totals = useMemo(() => summarizeAccounts(liveInvestments), [liveInvestments]);
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
      {investments.length > 0 && (
        <section className="px-x5 pt-x5 pb-x3">
          <p className="t4-medium text-fg-neutral-muted">총 평가금액</p>
          <div className="mt-x1 flex flex-wrap items-baseline gap-x-x2">
            <p className="t8-bold tabular-nums">{numberToKorean(totals.current) || "0원"}</p>
            <p className={`t4-medium tabular-nums ${profitToneClass(totals.profit)}`}>
              {formatProfitKorean(totals.profit)} ({formatReturnRate(totals.returnRate)})
            </p>
          </div>
        </section>
      )}

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
          secondaryActionProps={
            investments.length === 0
              ? {
                  children: "설정에서 데모 데이터 불러오기",
                  onClick: () => push("Settings", {}),
                }
              : undefined
          }
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
                onClick={() => onFocus(row.portfolioId)}
                aria-label={`${row.name} 식물 보기`}
                className="active:bg-bg-layer-default-pressed flex w-full items-center gap-x3 px-x4 py-x3 text-left"
              >
                <span className="relative shrink-0">
                  <PlantAvatar stage={PLANT_STAGES[row.stage]} pot={row.pot} size={44} />
                  {row.needsRebalance && (
                    <span className="absolute -top-[2px] -right-[2px]">
                      <RebalanceMark size={16} />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="t5-bold block truncate">{row.name}</span>
                  <span
                    className={`t3-regular mt-[2px] block truncate ${row.drooping ? "text-fg-warning" : "text-fg-neutral-subtle"}`}
                  >
                    {rowCaption(row)}
                  </span>
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
