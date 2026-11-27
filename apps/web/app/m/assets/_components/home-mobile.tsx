"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useFlow } from "@stackflow/react";
import { setRootBack } from "@web/app/m/_stack/stack-control";
import { EditPlantGoalSheet } from "@web/app/m/assets/portfolio/[id]/_components/portfolio-plant-card";
import { PriceAsOfBanner } from "@web/components/mobile/price-as-of-banner";
import { GardenCanvas } from "@web/features/garden/components/garden-canvas";
import { gardenLayout } from "@web/features/garden/plant-3d/garden-layout";
import type { PlantSlot } from "@web/features/garden/plant-3d/plant-renderer";
import {
  type GardenFocusAction,
  type GrownPlant,
  gardenFocusIndex,
  gardenFocusReducer,
  gardenHandlesBack,
  gardenPlantOptions,
  grownSince,
  type RebalanceDestination,
  rebalanceDestination,
} from "@web/features/garden/utils/garden-home";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { useStockPrices } from "@web/features/investments/utils/use-stock-prices";
import { usePortfolioStore } from "@web/features/portfolio/stores/portfolio-store";
import { PLANT_STAGE_LABELS } from "@web/features/portfolio/types/constants";
import { usePortfolioPlants } from "@web/features/portfolio/utils/use-portfolio-plants";
import { useRebalancingStore } from "@web/features/rebalancing/stores/rebalancing-store";
import { GardenFocusPanel } from "./garden-focus-panel";
import { GardenOverviewList } from "./garden-overview-list";

/** 정원 창 높이 (화면 높이 대비). 아래 목록만 스크롤하고 정원 창은 크기가 바뀌지 않는다. */
export const GARDEN_HEIGHT = "40dvh";
/** 마지막 scroll 뒤 이만큼 지나면 3D 렌더를 다시 돌린다 (ms). */
const SCROLL_IDLE_MS = 150;
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
 * 모바일 홈 (`/assets`) = 포트폴리오 식물 정원. 위쪽은 고정 높이 3D 정원 창, 아래는 스크롤 목록.
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
  const setPlantGoal = usePortfolioStore((s) => s.setPlantGoal);
  const investments = useInvestmentStore((s) => s.investments);
  const sessions = useRebalancingStore((s) => s.sessions);
  const allHoldings = useMemo(
    () => investments.flatMap((inv) => inv.holdings ?? []),
    [investments]
  );
  const { prices } = useStockPrices(allHoldings);
  const { push } = useFlow();

  const [focus, dispatchFocus] = useReducer(gardenFocusReducer, null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // 포커스를 바꾸면 아래 목록 내용이 바뀌니 맨 위부터 보인다.
  const dispatch = useCallback((action: GardenFocusAction) => {
    dispatchFocus(action);
    if (action.type !== "sync") scrollRef.current?.scrollTo({ top: 0 });
  }, []);
  // 목록은 한 박자 늦게 바꿔 카메라 이동이 먼저 시작되게 한다 (첫 전환 끊김 줄이기).
  const listFocus = useDeferredValue(focus);
  // 목표 시트: 닫는 애니메이션 동안에도 그 포트폴리오를 들고 있게 열림과 대상을 따로 둔다.
  const [goalFor, setGoalFor] = useState<string | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const openGoal = useCallback((portfolioId: string) => {
    setGoalFor(portfolioId);
    setGoalOpen(true);
  }, []);
  const [scrolling, setScrolling] = useState(false);
  const [celebration, setCelebration] = useState<GrownPlant | null>(null);

  const portfolioIds = useMemo(() => portfolios.map((p) => p.id), [portfolios]);
  useEffect(() => dispatch({ type: "sync", portfolioIds }), [dispatch, portfolioIds]);

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
    [dispatch]
  );

  const slots = useMemo<PlantSlot[]>(() => {
    const { spots } = gardenLayout(plants.length);
    return plants.flatMap((plant, i) => {
      const portfolio = portfolios.find((p) => p.id === plant.portfolioId);
      const spot = spots[i];
      if (!portfolio || !spot) return [];
      return [{ id: plant.portfolioId, options: gardenPlantOptions(plant, portfolio), ...spot }];
    });
  }, [plants, portfolios]);
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

  const go = useCallback(
    (destination: RebalanceDestination) => {
      if (destination.screen === "RebalancingNew") push("RebalancingNew", {});
      else push(destination.screen, { id: destination.id });
    },
    [push]
  );

  const openRebalancing = useCallback(
    (portfolioId: string) => {
      const portfolio = portfolios.find((p) => p.id === portfolioId);
      const destination = portfolio
        ? rebalanceDestination(portfolio, investments, prices, sessions)
        : null;
      if (destination) go(destination);
    },
    [portfolios, investments, prices, sessions, go]
  );

  const onPick = useCallback(
    (index: number | null, target: { badge: boolean }) => {
      const plant = index === null ? null : plants[index];
      dispatch({ type: "pick", portfolioId: plant?.portfolioId ?? null });
      if (plant && target.badge) openRebalancing(plant.portfolioId);
    },
    [plants, openRebalancing, dispatch]
  );

  const plantFirstSeed = () => {
    const id = addPortfolio();
    push("PortfolioDetail", { id });
  };

  const focusedPlant = plants.find((p) => p.portfolioId === listFocus) ?? null;
  const focusedPortfolio = portfolios.find((p) => p.id === listFocus) ?? null;
  const goalPortfolio = portfolios.find((p) => p.id === goalFor) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 시세 기준은 정원 전체·포커스 모두 앱바 바로 아래에 붙인다. */}
      <PriceAsOfBanner prices={prices} />
      <div
        className="garden-sky relative shrink-0 overflow-hidden"
        style={{ height: GARDEN_HEIGHT }}
      >
        <GardenCanvas
          slots={slots}
          layoutWidth={layoutWidth}
          garden
          focus={gardenFocusIndex(focus, plants)}
          paused={scrolling}
          onPick={onPick}
          className="h-full w-full"
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
            {PLANT_STAGE_LABELS[celebration.stage]}
            {toParticle(PLANT_STAGE_LABELS[celebration.stage])} 자랐어요
          </div>
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden"
      >
        {focusedPlant && focusedPortfolio ? (
          <GardenFocusPanel
            plant={focusedPlant}
            portfolio={focusedPortfolio}
            investments={investments}
            prices={prices}
            onOverview={() => dispatch({ type: "overview" })}
            onSetGoal={() => openGoal(focusedPortfolio.id)}
            onRebalance={() => openRebalancing(focusedPortfolio.id)}
            onOpenPortfolio={() => push("PortfolioDetail", { id: focusedPortfolio.id })}
          />
        ) : (
          <GardenOverviewList
            plants={plants}
            portfolios={portfolios}
            investments={investments}
            onFocus={(portfolioId) => dispatch({ type: "pick", portfolioId })}
            onPlantFirstSeed={plantFirstSeed}
          />
        )}
      </div>

      {goalPortfolio && (
        <EditPlantGoalSheet
          // 열 때마다 입력을 지금 목표로 새로 채운다.
          key={`${goalPortfolio.id}-${goalOpen}`}
          open={goalOpen}
          onOpenChange={setGoalOpen}
          progress={goalPortfolio}
          onSave={(amount) => setPlantGoal(goalPortfolio.id, amount)}
        />
      )}
    </div>
  );
}
