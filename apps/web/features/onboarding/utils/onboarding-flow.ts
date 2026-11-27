import type { Stock } from "@web/features/investments/types/stock";
import type { PortfolioAllocation } from "@web/features/portfolio/types/types";
import { findSeedPreset } from "../types/seed-presets";

/**
 * 첫 가입 흐름 (약관 동의 뒤): 닉네임 → 첫 씨앗 고르기 → 이름·첫 목표 → 종목 담기·비중 → 씨앗 심기
 * 연출 → 저장 방식 → 홈. 화면은 `components/onboarding-flow.tsx`, 여기는 상태 전환과 계산만 둔다.
 */
export type OnboardingStep = "nickname" | "seed" | "goal" | "stocks" | "planting" | "storage";

const NEXT_STEP: Record<OnboardingStep, OnboardingStep | "done"> = {
  nickname: "seed",
  seed: "goal",
  goal: "stocks",
  stocks: "planting",
  planting: "storage",
  storage: "done",
};

/** "다음" 으로 넘어갈 단계. */
export function nextOnboardingStep(step: OnboardingStep): OnboardingStep | "done" {
  return NEXT_STEP[step];
}

/**
 * "나중에 하기" 로 넘어갈 단계. 씨앗 단계부터는 남은 포트폴리오 단계를 건너뛰고 저장 방식으로 간다 —
 * 심은 씨앗은 그대로 씨앗으로 남아 정원에서 이어서 가꾼다.
 */
export function skipOnboardingStep(step: OnboardingStep): OnboardingStep | "done" {
  if (step === "nickname") return "seed";
  if (step === "storage") return "done";
  return "storage";
}

/**
 * 앱을 껐다 켜도 이어서 하도록 남겨 두는 진행 (계정별 기기 저장소). 포트폴리오를 만든 뒤 단계만
 * 남긴다 — 그 전 단계는 처음부터 다시 해도 잃는 것이 없다.
 */
export interface OnboardingProgress {
  step: "stocks" | "planting" | "storage";
  /** 이 흐름이 심은 포트폴리오. 씨앗 고르기를 건너뛰었으면 null. */
  portfolioId: string | null;
  presetId: string | null;
}

export const ONBOARDING_PROGRESS_KEY = "seedbook.onboarding";

const RESUMABLE_STEPS = new Set<OnboardingProgress["step"]>(["stocks", "planting", "storage"]);

export function parseOnboardingProgress(raw: string | null): OnboardingProgress | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { step, portfolioId, presetId } = value as Record<string, unknown>;
  if (!RESUMABLE_STEPS.has(step as OnboardingProgress["step"])) return null;
  const id = typeof portfolioId === "string" ? portfolioId : null;
  if (id === null && step !== "storage") return null;
  return {
    step: step as OnboardingProgress["step"],
    portfolioId: id,
    presetId: typeof presetId === "string" ? presetId : null,
  };
}

/** 흐름을 시작할 단계. 남긴 진행이 있고 그 포트폴리오가 아직 있으면 거기서 이어 간다. */
export function initialOnboardingStep({
  needsProfile,
  progress,
  portfolioIds,
}: {
  needsProfile: boolean;
  progress: OnboardingProgress | null;
  portfolioIds: readonly string[];
}): OnboardingStep {
  if (needsProfile) return "nickname";
  if (!progress) return "seed";
  if (progress.portfolioId !== null && !portfolioIds.includes(progress.portfolioId)) return "seed";
  return progress.step;
}

/**
 * 종목을 담는 묶음. 추천 카드는 자산군 하나가 묶음 하나(비중은 자산군 단위, 그 안의 종목은 똑같이
 * 나눈다). 직접 만들기는 종목 하나가 묶음 하나.
 */
export interface SeedGroup {
  id: string;
  label: string;
  percent: number;
  examples: readonly Stock[];
  stocks: Stock[];
}

export interface SeedDraft {
  /** 고른 추천 카드. 직접 만들면 null. */
  presetId: string | null;
  name: string;
  groups: SeedGroup[];
}

export const CUSTOM_SEED_NAME = "나의 첫 포트폴리오";

export function seedDraftFor(presetId: string | null): SeedDraft {
  const preset = findSeedPreset(presetId);
  if (!preset) return { presetId: null, name: CUSTOM_SEED_NAME, groups: [] };
  return {
    presetId: preset.id,
    name: preset.name,
    groups: preset.classes.map((c) => ({
      id: c.id,
      label: c.label,
      percent: c.percent,
      examples: c.examples,
      stocks: [],
    })),
  };
}

const toTenths = (percent: number) => Math.round(percent * 10);

/** `total` % 를 0.1% 단위로 `parts` 개로 똑같이 나눈다. 남는 0.1% 는 앞에서부터 준다. */
export function splitPercentEvenly(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const tenths = toTenths(total);
  const base = Math.floor(tenths / parts);
  const extra = tenths - base * parts;
  return Array.from({ length: parts }, (_, i) => (base + (i < extra ? 1 : 0)) / 10);
}

export const stockKey = (s: Pick<Stock, "market" | "ticker">) => `${s.market}:${s.ticker}`;

/** 이미 담은 종목 키 (검색 결과에서 비활성화). */
export function pickedStockKeys(draft: SeedDraft): Set<string> {
  return new Set(draft.groups.flatMap((g) => g.stocks.map(stockKey)));
}

/** 직접 만든 씨앗은 종목이 바뀔 때마다 비중을 똑같이 다시 나눈다. */
function evenCustomGroups(groups: SeedGroup[]): SeedGroup[] {
  const shares = splitPercentEvenly(100, groups.length);
  return groups.map((g, i) => ({ ...g, percent: shares[i] ?? 0 }));
}

/**
 * 종목을 담는다. `groupId` 가 null 이면 (직접 만들기) 종목 하나로 새 묶음을 만든다. 이미 담은
 * 종목이면 그대로 둔다.
 */
export function addSeedStock(draft: SeedDraft, groupId: string | null, stock: Stock): SeedDraft {
  if (pickedStockKeys(draft).has(stockKey(stock))) return draft;
  if (groupId === null) {
    const group: SeedGroup = {
      id: `stock:${stockKey(stock)}`,
      label: stock.name,
      percent: 0,
      examples: [],
      stocks: [stock],
    };
    return { ...draft, groups: evenCustomGroups([...draft.groups, group]) };
  }
  return {
    ...draft,
    groups: draft.groups.map((g) =>
      g.id === groupId ? { ...g, stocks: [...g.stocks, stock] } : g
    ),
  };
}

export function removeSeedStock(draft: SeedDraft, groupId: string, stock: Stock): SeedDraft {
  const key = stockKey(stock);
  if (draft.presetId === null) {
    return { ...draft, groups: evenCustomGroups(draft.groups.filter((g) => g.id !== groupId)) };
  }
  return {
    ...draft,
    groups: draft.groups.map((g) =>
      g.id === groupId ? { ...g, stocks: g.stocks.filter((s) => stockKey(s) !== key) } : g
    ),
  };
}

/** 묶음 비중을 바꾼다 (0~100, 0.1% 단위). */
export function setSeedGroupPercent(draft: SeedDraft, groupId: string, percent: number): SeedDraft {
  const clamped = Math.min(100, Math.max(0, toTenths(percent) / 10));
  return {
    ...draft,
    groups: draft.groups.map((g) => (g.id === groupId ? { ...g, percent: clamped } : g)),
  };
}

/** 비중 입력값 → %. 비우면 0, 숫자가 아니면 null. */
export function parsePercentDraft(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  return toTenths(value) / 10;
}

export type SeedStocksIssue =
  | { issue: null; totalPercent: number }
  | { issue: "empty"; totalPercent: number }
  | { issue: "group-without-stock"; totalPercent: number; group: string }
  | { issue: "total-not-100"; totalPercent: number };

/** 종목 담기 단계를 마칠 수 있는지. 막히면 첫 번째 이유. */
export function seedStocksIssue(draft: SeedDraft): SeedStocksIssue {
  const totalTenths = draft.groups.reduce((sum, g) => sum + toTenths(g.percent), 0);
  const totalPercent = totalTenths / 10;
  if (draft.groups.every((g) => g.stocks.length === 0)) return { issue: "empty", totalPercent };
  const empty = draft.groups.find((g) => g.percent > 0 && g.stocks.length === 0);
  if (empty) return { issue: "group-without-stock", totalPercent, group: empty.label };
  if (totalTenths !== 1000) return { issue: "total-not-100", totalPercent };
  return { issue: null, totalPercent };
}

export type SeedAllocation = Pick<
  PortfolioAllocation,
  "market" | "ticker" | "name" | "currency" | "targetPercent"
>;

/** 포트폴리오에 넣을 종목 비중. 묶음 비중을 그 안의 종목에 똑같이 나눈다. 0% 묶음은 뺀다. */
export function seedAllocations(draft: SeedDraft): SeedAllocation[] {
  return draft.groups.flatMap((g) => {
    if (g.percent <= 0) return [];
    const shares = splitPercentEvenly(g.percent, g.stocks.length);
    return g.stocks.map((s, i) => ({
      market: s.market,
      ticker: s.ticker,
      name: s.name,
      currency: s.currency,
      targetPercent: shares[i] ?? 0,
    }));
  });
}
