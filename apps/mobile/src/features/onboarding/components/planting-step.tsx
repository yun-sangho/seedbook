"use client";

import { useEffect, useMemo, useState } from "react";
import { GardenCanvas } from "@mobile/features/garden/components/garden-canvas";
import { gardenLayout } from "@mobile/features/garden/plant-3d/garden-layout";
import type { PlantSlot } from "@mobile/features/garden/plant-3d/plant-renderer";
import {
  hashString,
  kindForPortfolio,
  potForPortfolio,
} from "@mobile/features/garden/utils/garden-home";
import { numberToKorean } from "@mobile/utils/number-format";
import { OnboardingStepLayout } from "./onboarding-step-layout";

/** 시장 하락을 비로 보여 준다는 안내 (정원과 같은 규칙 — `plantRain`). */
const RAIN_HINT = "시세가 내려가면 비가 오고, 다시 오르면 그쳐요.";

/** 흙만 보이다가 씨앗이 심기기까지 (ms). */
const PLANT_DELAY_MS = 700;

/**
 * 심은 씨앗. 홈 정원과 같은 화분 색·종류 (포트폴리오 id 로 정해진다 — 씨앗 색으로 종류가 보인다).
 * `empty` 면 씨앗 없이 흙만 있는 빈 화분 (목표 없는 포트폴리오).
 */
export function seedSlotFor(portfolioId: string | null, { empty = false } = {}): PlantSlot {
  return {
    options: {
      stage: "seed",
      rain: 0,
      wilt: 0,
      ripe: false,
      empty,
      needsRebalance: false,
      pot: portfolioId ? potForPortfolio(portfolioId) : "terracotta",
      seed: portfolioId ? hashString(portfolioId) % 1000 : 3,
      kind: portfolioId ? kindForPortfolio(portfolioId) : "tree",
    },
    x: 0,
    z: 0,
  };
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/**
 * 씨앗 심기 연출: 흙만 있는 정원에 화분이 놓이고 씨앗이 심긴다. 새 포트폴리오는 씨앗(0단계)이라 새싹은
 * 보여 주지 않고, 목표에 가까워질수록 자란다고 안내한다 (홈 정원과 같은 모습). 목표를 미뤘으면 빈 화분을
 * 놓고 목표를 정하면 씨앗을 심는다고 안내한다.
 */
export function PlantingStep({
  portfolioId,
  name,
  goalAmount,
  onNext,
}: {
  portfolioId: string | null;
  name: string;
  /** 목표 금액. null 이면 빈 화분. */
  goalAmount: number | null;
  onNext: () => void;
}) {
  const [planted, setPlanted] = useState(prefersReducedMotion);
  useEffect(() => {
    if (planted) return;
    const timer = setTimeout(() => setPlanted(true), PLANT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [planted]);

  const empty = goalAmount === null;
  const layoutWidth = gardenLayout(1).width;
  const slots = useMemo(
    () => (planted ? [seedSlotFor(portfolioId, { empty })] : []),
    [planted, portfolioId, empty]
  );

  const title = empty
    ? planted
      ? "빈 화분을 놓았어요"
      : "화분을 놓고 있어요"
    : planted
      ? `'${name}'에 씨앗을 심었어요`
      : "씨앗을 심고 있어요";
  const description = !planted
    ? undefined
    : empty
      ? `'${name}'에 목표 금액을 정하면 씨앗을 심어요. 정원에서 언제든 정할 수 있어요.`
      : `포트폴리오가 목표 ${numberToKorean(goalAmount)}에 가까워질수록 식물이 자라요. ${RAIN_HINT}`;

  return (
    <OnboardingStepLayout
      step="planting"
      title={title}
      description={description}
      primary={{ label: "다음", onClick: onNext, disabled: !planted }}
    >
      <div
        className={`aspect-square w-full overflow-hidden rounded-r6 bg-[#F3EFE6] dark:bg-[#26241F] ${
          planted ? "animate-seed-plant motion-reduce:animate-none" : ""
        }`}
      >
        <GardenCanvas
          slots={slots}
          layoutWidth={layoutWidth}
          garden
          focus={planted ? 0 : null}
          className="h-full w-full"
        />
      </div>
    </OnboardingStepLayout>
  );
}
