import {
  FERN_STAGE_LABELS,
  PLANT_STAGE_LABELS,
  type PlantKind,
} from "@mobile/features/garden/plant-3d/plant-options";
import type { Stock } from "@mobile/features/investments/types/stock";
import { INITIAL_PLANT_PROGRESS } from "@mobile/features/portfolio/types/constants";
import type { PortfolioAllocation } from "@mobile/features/portfolio/types/types";
import { planStageGoals } from "@mobile/features/portfolio/utils/plant-season";
import { findSeedPreset } from "../types/seed-presets";

/**
 * 첫 가입 흐름 (약관 동의 뒤): 닉네임 → 화분 고르기(추천 구성·직접, 이름) → 종목·비중 담기(여기서 화분 =
 * 포트폴리오를 만든다) → 씨앗 심기(목표 금액 하나) → 심기 연출(목표를 미루면 빈 화분) → 저장 방식 → 홈.
 * 화분을 먼저 만들고 씨앗은 그다음이다 (사용자 결정 2026-11-28). 화면은 `components/onboarding-flow.tsx`,
 * 여기는 상태 전환과 계산만 둔다.
 */
export type OnboardingStep = "nickname" | "pot" | "stocks" | "seed" | "planting" | "storage";

const STEP_ORDER = [
  "nickname",
  "pot",
  "stocks",
  "seed",
  "planting",
  "storage",
] as const satisfies readonly OnboardingStep[];

/** 진행 표시 칸 수 — 모든 단계가 한 칸씩. */
export const ONBOARDING_PROGRESS_STEPS = STEP_ORDER.length;

/** 진행 표시에서 이 단계의 칸 (1부터). */
export function onboardingProgressIndex(step: OnboardingStep): number {
  return STEP_ORDER.indexOf(step) + 1;
}

/** "다음" 으로 넘어갈 단계. */
export function nextOnboardingStep(step: OnboardingStep): OnboardingStep | "done" {
  return STEP_ORDER[STEP_ORDER.indexOf(step) + 1] ?? "done";
}

/**
 * "나중에 하기" 로 넘어갈 단계. 화분을 만들기 전(화분 고르기·종목)에 미루면 저장 방식으로 간다. 씨앗(목표)을
 * 미루면 만든 화분은 빈 화분으로 남고, 그 모습을 보여 준 뒤 저장 방식으로 간다.
 */
export function skipOnboardingStep(step: OnboardingStep): OnboardingStep | "done" {
  if (step === "nickname") return "pot";
  if (step === "seed") return "planting";
  if (step === "storage") return "done";
  return "storage";
}

/**
 * 앱을 껐다 켜도 이어서 하도록 남겨 두는 진행 (계정별 기기 저장소). 화분(포트폴리오)을 만든 뒤 단계만
 * 남긴다 — 그 전 단계는 처음부터 다시 해도 잃는 것이 없다. `stocks` 는 이전 앱(씨앗을 먼저 심던 흐름)이
 * 남긴 값 — 그때는 종목 단계 전에 포트폴리오가 있었다.
 */
export interface OnboardingProgress {
  step: "stocks" | "seed" | "planting" | "storage";
  /** 이 흐름이 만든 포트폴리오. 화분 고르기를 건너뛰었으면 null. */
  portfolioId: string | null;
  presetId: string | null;
}

export const ONBOARDING_PROGRESS_KEY = "seedbook.onboarding";

const RESUMABLE_STEPS = new Set<OnboardingProgress["step"]>([
  "stocks",
  "seed",
  "planting",
  "storage",
]);

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
  if (!progress) return "pot";
  if (progress.portfolioId !== null && !portfolioIds.includes(progress.portfolioId)) return "pot";
  return progress.step;
}

/** 씨앗 심기 화면의 단계 미리보기 한 줄: 이 금액에 닿으면 이 단계가 된다. */
export interface SeedStagePreview {
  label: string;
  amount: number;
}

/**
 * 목표 금액 하나를 식물이 지나갈 단계(새싹 … 꽃, 마지막 열매)로 나눈 미리보기. 온보딩의 화분은 아직
 * 연결 계좌가 없어 0원에서 출발한다 — 저장하는 단계 목표(`setPlantGoal` → `planStageGoals`)와 같은 계산.
 */
export function seedStagePreview(kind: PlantKind, finalGoal: number): SeedStagePreview[] {
  const goals = planStageGoals({ ...INITIAL_PLANT_PROGRESS, plantKind: kind }, finalGoal, 0);
  const labels = kind === "fern" ? FERN_STAGE_LABELS : PLANT_STAGE_LABELS;
  const stageNames = [labels.sprout, labels.sapling, labels.tree, "꽃", "열매"];
  return goals.map((amount, i) => ({ label: stageNames[i] ?? "열매", amount }));
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
