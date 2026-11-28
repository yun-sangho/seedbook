"use client";

import { useEffect, useState } from "react";
import { StorageChoiceScreen } from "@mobile/components/storage-choice-screen";
import { plantKindOf } from "@mobile/features/garden/utils/garden-home";
import { usePortfolioStore } from "@mobile/features/portfolio/stores/portfolio-store";
import type { PortfolioItem } from "@mobile/features/portfolio/types/types";
import { accountStorage } from "@mobile/lib/account-storage";
import { useHideSplash } from "@mobile/lib/native/splash";
import {
  CUSTOM_SEED_NAME,
  initialOnboardingStep,
  ONBOARDING_PROGRESS_KEY,
  type OnboardingProgress,
  type OnboardingStep,
  parseOnboardingProgress,
  type SeedAllocation,
  type SeedDraft,
  seedAllocations,
  seedDraftFor,
} from "../utils/onboarding-flow";
import { NicknameStep } from "./nickname-step";
import { OnboardingProgressBar } from "./onboarding-step-layout";
import { PlantingStep } from "./planting-step";
import { type PotChoice, PotStep } from "./pot-step";
import { SeedStep } from "./seed-step";
import { StocksStep } from "./stocks-step";

/** 흐름이 끝나면 여는 홈 (`/assets`, 하단 탭 홈). */
export const ONBOARDING_HOME_PATH = "/assets";

function readProgress(): OnboardingProgress | null {
  return parseOnboardingProgress(accountStorage.getItem(ONBOARDING_PROGRESS_KEY));
}

function saveProgress(progress: OnboardingProgress | null) {
  if (progress === null) accountStorage.removeItem(ONBOARDING_PROGRESS_KEY);
  else accountStorage.setItem(ONBOARDING_PROGRESS_KEY, JSON.stringify(progress));
}

/** 이전 진행 기록을 지운다 (흐름을 다시 띄우지 않는 계정). */
export function clearOnboardingProgress() {
  saveProgress(null);
}

function replaceAllocations(portfolioId: string, allocations: SeedAllocation[]) {
  const store = usePortfolioStore.getState();
  const portfolio = store.portfolios.find((p) => p.id === portfolioId);
  if (!portfolio) return;
  for (const allocation of portfolio.allocations)
    store.removeAllocation(portfolioId, allocation.id);
  for (const allocation of allocations) store.addAllocation(portfolioId, allocation);
}

/** 포트폴리오의 최종 목표 (수확 목표). 단계 목표가 있으면 그 마지막, 없으면 지금 목표. */
function finalGoalOf(portfolio: PortfolioItem | undefined): number | null {
  if (!portfolio) return null;
  return portfolio.stageGoals.at(-1) ?? portfolio.goalAmount ?? null;
}

/** 온보딩에서 만든 화분은 아직 연결 계좌가 없다 (0원 — 목표의 하한이 없다). */
const NEW_POT_VALUATION = { value: 0, pricesComplete: true };

/**
 * 첫 가입 흐름 (약관 동의 뒤, 새 가입자만): 닉네임 → 화분 고르기 → 종목·비중 (여기서 화분 = 포트폴리오를
 * 만든다) → 씨앗 심기(목표) → 심기 연출 → 저장 방식. 화분을 만든 뒤 단계의 진행을 계정별 기기 저장소에
 * 남겨 앱을 다시 열면 이어서 한다. 저장 방식은 마지막에 고르므로 그 전까지 만든 포트폴리오는 이 기기에
 * 있다가, 클라우드를 고르면 함께 올라간다 (`applyStorageChoice`).
 */
export function OnboardingFlow({
  needsProfile,
  defaultNickname,
  onDone,
}: {
  needsProfile: boolean;
  defaultNickname: string;
  onDone: () => void;
}) {
  useHideSplash();
  const [resume] = useState(() => {
    const progress = readProgress();
    const portfolioIds = usePortfolioStore.getState().portfolios.map((p) => p.id);
    const step = initialOnboardingStep({ needsProfile: false, progress, portfolioIds });
    return { step, progress: step === "pot" ? null : progress };
  });
  const [step, setStep] = useState<OnboardingStep>(needsProfile ? "nickname" : resume.step);
  const [portfolioId, setPortfolioId] = useState<string | null>(
    resume.progress?.portfolioId ?? null
  );
  const portfolio = usePortfolioStore((s) => s.portfolios.find((p) => p.id === portfolioId));
  /** 고른 화분 구성·이름. 아직 고르지 않았으면 undefined. */
  const [pot, setPot] = useState<PotChoice | undefined>(() =>
    resume.progress
      ? { presetId: resume.progress.presetId, name: portfolio?.name ?? CUSTOM_SEED_NAME }
      : undefined
  );
  const [draft, setDraft] = useState<SeedDraft>(() => {
    const base = seedDraftFor(resume.progress?.presetId ?? null);
    return portfolio ? { ...base, name: portfolio.name } : base;
  });

  // 마지막 단계(저장 방식)부터는 주소를 홈으로 둔다 — 클라우드를 골라 새로 불러와도 홈이 열린다.
  useEffect(() => {
    if (step === "storage") {
      window.history.replaceState(window.history.state, "", ONBOARDING_HOME_PATH);
    }
  }, [step]);

  const goTo = (next: OnboardingStep, id: string | null = portfolioId) => {
    if (next === "seed" || next === "planting" || next === "storage") {
      saveProgress({ step: next, portfolioId: id, presetId: pot?.presetId ?? null });
    }
    setStep(next);
  };

  /** 화분(포트폴리오)을 만들거나, 이미 만들었으면 이름·종목만 고친다. */
  const makePot = (allocations: SeedAllocation[]): string => {
    const store = usePortfolioStore.getState();
    const name = pot?.name ?? draft.name;
    const existing = store.portfolios.some((p) => p.id === portfolioId);
    const id = existing && portfolioId ? portfolioId : store.addPortfolio(name);
    if (existing) store.updatePortfolio(id, "name", name);
    replaceAllocations(id, allocations);
    setPortfolioId(id);
    return id;
  };

  /** 씨앗 심기 (목표). null 이면 빈 화분으로 둔다. */
  const plantSeed = (goalAmount: number | null) => {
    if (portfolioId) {
      usePortfolioStore.getState().setPlantGoal(portfolioId, goalAmount, NEW_POT_VALUATION);
    }
    goTo("planting");
  };

  switch (step) {
    case "nickname":
      return <NicknameStep defaultNickname={defaultNickname} onDone={() => goTo(resume.step)} />;

    case "pot":
      return (
        <PotStep
          initial={pot}
          onChoose={(choice) => {
            if (choice.presetId !== pot?.presetId) setDraft(seedDraftFor(choice.presetId));
            setPot(choice);
            setStep("stocks");
          }}
          onLater={() => goTo("storage")}
        />
      );

    case "stocks":
      return (
        <StocksStep
          draft={draft}
          onChange={setDraft}
          onBack={() => setStep("pot")}
          onNext={() => goTo("seed", makePot(seedAllocations(draft)))}
          onLater={() => {
            // 담은 종목이 있으면 화분은 만들어 둔다 — 정원에서 이어서 고친다.
            const picked = seedAllocations(draft);
            goTo("storage", picked.length > 0 ? makePot(picked) : portfolioId);
          }}
        />
      );

    case "seed":
      return (
        <SeedStep
          kind={portfolio ? plantKindOf(portfolio) : "tree"}
          initialGoal={finalGoalOf(portfolio)}
          onBack={() => setStep("stocks")}
          onPlant={plantSeed}
          onLater={() => plantSeed(null)}
        />
      );

    case "planting":
      return (
        <PlantingStep
          portfolioId={portfolioId}
          name={portfolio?.name ?? pot?.name ?? draft.name}
          goalAmount={finalGoalOf(portfolio)}
          onNext={() => goTo("storage")}
        />
      );

    case "storage":
      return (
        <StorageChoiceScreen
          current={null}
          allowLater
          header={<OnboardingProgressBar step="storage" />}
          onDone={() => {
            saveProgress(null);
            onDone();
          }}
        />
      );
  }
}
