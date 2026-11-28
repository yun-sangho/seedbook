"use client";

import { useEffect, useState } from "react";
import { StorageChoiceScreen } from "@mobile/components/storage-choice-screen";
import { findSeedPreset } from "@mobile/features/onboarding/types/seed-presets";
import { usePortfolioStore } from "@mobile/features/portfolio/stores/portfolio-store";
import { accountStorage } from "@mobile/lib/account-storage";
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
import { GoalStep, type SeedBasics } from "./goal-step";
import { NicknameStep } from "./nickname-step";
import { PlantingStep } from "./planting-step";
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

/**
 * 첫 가입 흐름 (약관 동의 뒤, 새 가입자만): 닉네임 → 첫 씨앗 → 이름·목표 → 종목·비중 → 심기 연출 →
 * 저장 방식. 포트폴리오는 이름·목표 단계를 마치면(또는 건너뛰면) 만들고, 이후 단계의 진행을 계정별
 * 기기 저장소에 남겨 앱을 다시 열면 이어서 한다. 저장 방식은 마지막에 고르므로 그 전까지 만든
 * 포트폴리오는 이 기기에 있다가, 클라우드를 고르면 함께 올라간다 (`applyStorageChoice`).
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
  const [resume] = useState(() => {
    const progress = readProgress();
    const portfolioIds = usePortfolioStore.getState().portfolios.map((p) => p.id);
    const step = initialOnboardingStep({ needsProfile: false, progress, portfolioIds });
    return { step, progress: step === "seed" ? null : progress };
  });
  const [step, setStep] = useState<OnboardingStep>(needsProfile ? "nickname" : resume.step);
  const [portfolioId, setPortfolioId] = useState<string | null>(
    resume.progress?.portfolioId ?? null
  );
  /** 고른 카드. 아직 고르지 않았으면 undefined, 직접 만들기는 null. */
  const [presetId, setPresetId] = useState<string | null | undefined>(
    resume.progress ? resume.progress.presetId : undefined
  );
  const portfolio = usePortfolioStore((s) => s.portfolios.find((p) => p.id === portfolioId));
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
    if (next === "stocks" || next === "planting" || next === "storage") {
      saveProgress({ step: next, portfolioId: id, presetId: presetId ?? null });
    }
    setStep(next);
  };

  /** 씨앗(포트폴리오)을 심거나, 이미 심었으면 이름·목표만 고친다. */
  const plantSeed = ({ name, goalAmount }: SeedBasics): string => {
    const store = usePortfolioStore.getState();
    const existing = store.portfolios.some((p) => p.id === portfolioId);
    const id = existing && portfolioId ? portfolioId : store.addPortfolio(name);
    if (existing) store.updatePortfolio(id, "name", name);
    // 온보딩에서 만든 씨앗은 아직 연결 계좌가 없다 (0원 — 첫 목표의 하한이 없다).
    store.setPlantGoal(id, goalAmount, { value: 0, pricesComplete: true });
    setPortfolioId(id);
    setDraft((d) => ({ ...d, name }));
    return id;
  };

  switch (step) {
    case "nickname":
      return <NicknameStep defaultNickname={defaultNickname} onDone={() => goTo(resume.step)} />;

    case "seed":
      return (
        <SeedStep
          initial={presetId}
          onChoose={(id) => {
            if (id !== presetId) setDraft(seedDraftFor(id));
            setPresetId(id);
            setStep("goal");
          }}
          onLater={() => goTo("storage")}
        />
      );

    case "goal": {
      const fallbackName = findSeedPreset(presetId)?.name ?? CUSTOM_SEED_NAME;
      return (
        <GoalStep
          initial={{ name: draft.name, goalAmount: portfolio?.goalAmount ?? null }}
          fallbackName={fallbackName}
          onBack={() => setStep("seed")}
          onNext={(basics) => goTo("stocks", plantSeed(basics))}
          onLater={(basics) => goTo("storage", plantSeed(basics))}
        />
      );
    }

    case "stocks":
      return (
        <StocksStep
          draft={draft}
          onChange={setDraft}
          onBack={() => setStep("goal")}
          onNext={() => {
            if (portfolioId) replaceAllocations(portfolioId, seedAllocations(draft));
            goTo("planting");
          }}
          onLater={() => {
            // 담은 종목은 남긴다 — 정원에서 이어서 고친다.
            const picked = seedAllocations(draft);
            if (portfolioId && picked.length > 0) replaceAllocations(portfolioId, picked);
            goTo("storage");
          }}
        />
      );

    case "planting":
      return (
        <PlantingStep
          portfolioId={portfolioId}
          name={portfolio?.name ?? draft.name}
          goalAmount={portfolio?.goalAmount ?? null}
          onNext={() => goTo("storage")}
        />
      );

    case "storage":
      return (
        <StorageChoiceScreen
          current={null}
          allowLater
          onDone={() => {
            saveProgress(null);
            onDone();
          }}
        />
      );
  }
}
