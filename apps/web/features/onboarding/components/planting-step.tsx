"use client";

import { useEffect, useMemo, useState } from "react";
import { GardenCanvas } from "@web/features/garden/components/garden-canvas";
import { gardenLayout } from "@web/features/garden/plant-3d/garden-layout";
import type { PlantSlot } from "@web/features/garden/plant-3d/plant-renderer";
import { numberToKorean } from "@web/utils/number-format";
import { OnboardingStepLayout } from "./onboarding-step-layout";

/** 흙만 보이다가 씨앗이 심기기까지 (ms). */
const PLANT_DELAY_MS = 700;

const SEED_SLOT: PlantSlot = {
  options: { stage: "seed", droop: 0, needsRebalance: false, pot: "terracotta", seed: 3 },
  x: 0,
  z: 0,
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/**
 * 씨앗 심기 연출: 흙만 있는 정원에 씨앗이 심긴다. 새 포트폴리오는 씨앗(0단계)이라 새싹은 보여 주지
 * 않고, 첫 목표에 닿으면 새싹이 튼다고 안내한다 (사용자 결정 — 홈 정원과 같은 모습).
 */
export function PlantingStep({
  name,
  goalAmount,
  onNext,
}: {
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
  const slots = useMemo(() => (planted ? [SEED_SLOT] : []), [planted]);

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
