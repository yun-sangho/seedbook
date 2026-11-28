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

/** 흙만 보이다가 씨앗이 심기기까지 (ms). */
const PLANT_DELAY_MS = 700;

/** 심은 씨앗. 홈 정원과 같은 화분 색·종류 (포트폴리오 id 로 정해진다 — 씨앗 색으로 종류가 보인다). */
export function seedSlotFor(portfolioId: string | null): PlantSlot {
  return {
    options: {
      stage: "seed",
      wind: 0,
      wilt: 0,
      ripe: 0,
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
 * 씨앗 심기 연출: 흙만 있는 정원에 씨앗이 심긴다. 새 포트폴리오는 씨앗(0단계)이라 새싹은 보여 주지
 * 않고, 첫 목표에 닿으면 새싹이 튼다고 안내한다 (사용자 결정 — 홈 정원과 같은 모습).
 */
export function PlantingStep({
  portfolioId,
  name,
  goalAmount,
  onNext,
}: {
  portfolioId: string | null;
  name: string;
  goalAmount: number | null;
  onNext: () => void;
}) {
  const [planted, setPlanted] = useState(prefersReducedMotion);
  useEffect(() => {
    if (planted) return;
    const timer = setTimeout(() => setPlanted(true), PLANT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [planted]);

  const layoutWidth = gardenLayout(1).width;
  const slots = useMemo(() => (planted ? [seedSlotFor(portfolioId)] : []), [planted, portfolioId]);

  return (
    <OnboardingStepLayout
      title={planted ? `'${name}' 씨앗을 심었어요` : "씨앗을 심고 있어요"}
      description={
        planted
          ? goalAmount === null
            ? "첫 목표 금액을 정하면, 포트폴리오가 그 금액에 닿을 때 새싹이 터요."
            : `포트폴리오가 첫 목표 ${numberToKorean(goalAmount)}에 닿으면 새싹이 터요.`
          : undefined
      }
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
