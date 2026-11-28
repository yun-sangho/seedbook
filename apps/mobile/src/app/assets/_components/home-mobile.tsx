"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { IconChevronRightLine } from "@karrotmarket/react-monochrome-icon";
import { setRootBack } from "@mobile/app/_stack/stack-control";
import { PriceAsOfBanner } from "@mobile/components/mobile/price-as-of-banner";
import { SyncProblemBanner } from "@mobile/components/mobile/sync-problem-banner";
import { GardenCanvas } from "@mobile/features/garden/components/garden-canvas";
import { gardenLayout, spotsTallestToBack } from "@mobile/features/garden/plant-3d/garden-layout";
import type { PlantSlot } from "@mobile/features/garden/plant-3d/plant-renderer";
import {
  type GrownPlant,
  gardenFocusIndex,
  gardenFocusReducer,
  gardenHandlesBack,
  gardenPlantOptions,
  grownSince,
  plantStageLabel,
} from "@mobile/features/garden/utils/garden-home";
import { useInvestmentStore } from "@mobile/features/investments/stores/investment-store";
import { useStockPrices } from "@mobile/features/investments/utils/use-stock-prices";
import { usePortfolioStore } from "@mobile/features/portfolio/stores/portfolio-store";
import { usePortfolioPlants } from "@mobile/features/portfolio/utils/use-portfolio-plants";
import { Icon } from "@seed-design/react";
import { useFlow } from "@stackflow/react";
import { GardenOverviewList, GardenTotalHeader } from "./garden-overview-list";
import { GardenSheet } from "./garden-sheet";

/** 마지막 scroll 뒤 이만큼 지나면 3D 렌더를 다시 돌린다 (ms). */
const SCROLL_IDLE_MS = 150;
/**
 * 식물을 누른 뒤 "자세히 보기" 칩을 띄우기까지 (ms). 바텀시트가 내려가고(260ms) 카메라가 거의 다
 * 다가간 뒤에 나오게 한다.
 */
const DETAIL_CHIP_DELAY_MS = 650;
/** 성장 축하 문구를 보여주는 시간 (ms, `animate-garden-celebrate` 와 같게). */
const CELEBRATE_MS = 3200;

/** 받침 없는 마지막 글자면 "로", 있으면 "으로" (ㄹ 받침도 "로"). */
function toParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return "(으)로";
  const final = code % 28;
  return final === 0 || final === 8 ? "로" : "으로";
}

/**
 * 모바일 홈 (`/assets`) = 포트폴리오 식물 정원. 3D 정원이 화면을 채우고, 목록은 그 위로 끌어 올리는
 * 바텀시트 (`GardenSheet`, 머리 = 총 평가금액). 정원은 받침 앞쪽 끝이 영역 세로 가운데에 오게 고정
 * (위쪽 절반에 식물), 시트는 처음에 그 아래까지 올라오고, 끌면 정원은 그대로 둔 채 시트가 덮는다.
 *
 * - 정원 전체: 목록은 전체 포트폴리오 (식물을 누르거나 행을 누르면 그 식물로 다가간다)
 * - 포커스: 카메라가 그 식물로 다가가고, 목록은 그 포트폴리오 요약 + 종목
 * - 되돌리기: 정원 빈 곳 탭, 목록의 "정원 전체", 뒤로가기 (스택의 루트 뒤로가기 — Android 시스템
 *   뒤로가기 포함, `stack-control.ts` 의 `setRootBack`). 포커스는 정원 창 카메라와 이어진 화면 안
 *   상태라 스택 화면이나 브라우저 히스토리로 두지 않는다.
 */
export function HomeMobile() {
  const plants = usePortfolioPlants();
  const portfolios = usePortfolioStore((s) => s.portfolios);
  const addPortfolio = usePortfolioStore((s) => s.addPortfolio);
  const investments = useInvestmentStore((s) => s.investments);
  const allHoldings = useMemo(
    () => investments.flatMap((inv) => inv.holdings ?? []),
    [investments]
  );
  const { prices } = useStockPrices(allHoldings);
  const { push } = useFlow();

  const [focus, dispatch] = useReducer(gardenFocusReducer, null);
  const [scrolling, setScrolling] = useState(false);
  // 정원 영역. 바텀시트는 이 영역 안에서 정원 위를 덮는다.
  const areaRef = useRef<HTMLDivElement>(null);
  const [celebration, setCelebration] = useState<GrownPlant | null>(null);

  const portfolioIds = useMemo(() => portfolios.map((p) => p.id), [portfolios]);
  useEffect(() => dispatch({ type: "sync", portfolioIds }), [portfolioIds]);

  // 포커스 중이면 뒤로가기가 정원 전체로 돌아간다. 홈 탭이 숨으면 effect 가 멈춰 함께 풀린다.
  const focusRef = useRef(focus);
  focusRef.current = focus;
  useEffect(
    () =>
      setRootBack(() => {
        if (!gardenHandlesBack(focusRef.current)) return false;
        dispatch({ type: "back" });
        return true;
      }),
    []
  );

  const slots = useMemo<PlantSlot[]>(() => {
    const { spots } = gardenLayout(plants.length);
    // 키 큰 식물을 뒷줄에 둬 앞줄 나무가 뒷줄을 가리지 않게 한다 (slots 순서는 plants 순서 그대로).
    const spotOf = spotsTallestToBack(plants.map((plant) => plant.stage));
    return plants.flatMap((plant, i) => {
      const spot = spots[spotOf[i] ?? i];
      if (!spot) return [];
      return [{ id: plant.portfolioId, options: gardenPlantOptions(plant), ...spot }];
    });
  }, [plants]);
  const layoutWidth = useMemo(() => gardenLayout(plants.length).width, [plants.length]);

  // 화면을 연 동안 자란 식물을 축하한다 (처음 볼 때는 축하하지 않는다).
  const seenStages = useRef<Map<string, number> | null>(null);
  useEffect(() => {
    const grown = grownSince(seenStages.current, plants);
    seenStages.current = new Map(plants.map((p) => [p.portfolioId, p.stage]));
    const [first] = grown;
    if (first) setCelebration(first);
  }, [plants]);
  useEffect(() => {
    if (!celebration) return;
    const timer = setTimeout(() => setCelebration(null), CELEBRATE_MS);
    return () => clearTimeout(timer);
  }, [celebration]);

  // 목록 스크롤 중에는 3D 렌더를 멈춘다. 상태는 바뀔 때만 갱신한다.
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollingRef = useRef(false);
  const onScroll = useCallback(() => {
    if (!scrollingRef.current) {
      scrollingRef.current = true;
      setScrolling(true);
    }
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      scrollingRef.current = false;
      setScrolling(false);
    }, SCROLL_IDLE_MS);
  }, []);
  useEffect(
    () => () => {
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    },
    []
  );

  // 식물(`!` 배지 포함)을 누르면 카메라만 다가가고, 시트는 내려가며 위에 "자세히 보기" 칩이 뜬다.
  const onPick = useCallback(
    (index: number | null) => {
      const plant = index === null ? null : plants[index];
      dispatch({ type: "pick", portfolioId: plant?.portfolioId ?? null });
    },
    [plants]
  );

  const plantFirstSeed = () => {
    const id = addPortfolio();
    push("PortfolioDetail", { id });
  };

  const focusedPortfolio = portfolios.find((p) => p.id === focus) ?? null;
  const focusedId = focusedPortfolio?.id ?? null;
  // 칩은 포커스·시트 내리기가 끝난 뒤에 띄운다. 포커스가 바뀌거나 풀리면 바로 숨긴다.
  const [chipFor, setChipFor] = useState<string | null>(null);
  useEffect(() => {
    setChipFor(null);
    if (focusedId === null) return;
    const timer = setTimeout(() => setChipFor(focusedId), DETAIL_CHIP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [focusedId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 시세 기준은 정원 전체·포커스 모두 앱바 바로 아래에 붙인다. */}
      <SyncProblemBanner />
      <PriceAsOfBanner prices={prices} />
      <div ref={areaRef} className="garden-sky relative min-h-0 flex-1 overflow-hidden">
        <GardenCanvas
          slots={slots}
          layoutWidth={layoutWidth}
          garden
          anchor="groundEdge"
          focus={gardenFocusIndex(focus, plants)}
          paused={scrolling}
          onPick={onPick}
          className="absolute inset-0"
        />
        {plants.length === 0 && (
          <p className="t4-medium text-fg-neutral-muted pointer-events-none absolute inset-x-0 top-[var(--seed-dimension-x6)] text-center">
            아직 심은 씨앗이 없어요
          </p>
        )}
        {celebration && (
          <div
            key={`${celebration.portfolioId}-${celebration.stage}`}
            role="status"
            className="animate-garden-celebrate bg-bg-layer-floating t4-bold pointer-events-none absolute inset-x-[var(--seed-dimension-x4)] top-[var(--seed-dimension-x4)] z-10 rounded-full px-x4 py-x2 text-center shadow-md"
          >
            🎉 {celebration.name ? `${celebration.name} 식물이` : "식물이"}{" "}
            {plantStageLabel(celebration.kind, celebration.stage)}
            {toParticle(plantStageLabel(celebration.kind, celebration.stage))} 자랐어요
          </div>
        )}
        <GardenSheet
          areaRef={areaRef}
          header={<GardenTotalHeader investments={investments} />}
          onScroll={onScroll}
          collapsed={focusedPortfolio !== null}
          floating={
            chipFor !== null &&
            chipFor === focusedId && (
              <button
                type="button"
                onClick={() => push("PortfolioDetail", { id: chipFor })}
                aria-label={`${focusedPortfolio?.name || "포트폴리오"} 자세히 보기`}
                className="animate-garden-chip-in bg-bg-layer-floating t4-bold active:bg-bg-layer-floating-pressed flex items-center gap-x1 rounded-full py-x2 pr-x3 pl-x4 shadow-md"
              >
                자세히 보기
                <Icon svg={<IconChevronRightLine />} size="x4" />
              </button>
            )
          }
        >
          <GardenOverviewList
            plants={plants}
            portfolios={portfolios}
            investments={investments}
            onOpenPortfolio={(id) => push("PortfolioDetail", { id })}
            onPlantFirstSeed={plantFirstSeed}
          />
        </GardenSheet>
      </div>
    </div>
  );
}
