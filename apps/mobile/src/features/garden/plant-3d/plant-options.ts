import type { PlantKind } from "@seedbook/domain/v1/portfolio-types";

/**
 * 포트폴리오 식물의 그리기 옵션. three 를 가져오지 않는 순수 모듈이라 화면·컨트롤이 3D 번들 없이 쓴다.
 */

/** 씨앗(0) → 새싹(1) → 묘목(2) → 나무(3) → 꽃·열매(4). 목표를 달성할 때마다 한 단계 자란다. */
export const PLANT_STAGES = ["seed", "sprout", "sapling", "tree", "bloom"] as const;
export type PlantStage = (typeof PLANT_STAGES)[number];

export const PLANT_STAGE_LABELS: Record<PlantStage, string> = {
  seed: "씨앗",
  sprout: "새싹",
  sapling: "묘목",
  tree: "나무",
  bloom: "꽃·열매",
};

/** 식물 종류. `tree` 는 씨앗 → 나무 → 꽃·열매, `fern` 은 보스턴고사리. 포트폴리오마다 정해진다 (`kindForPortfolio`). 없으면 `tree`. */
export { PLANT_KINDS } from "@seedbook/domain";
export type { PlantKind };

export const PLANT_KIND_LABELS: Record<PlantKind, string> = {
  tree: "나무",
  fern: "고사리",
};

/** 고사리 단계 이름. 4단계는 나무처럼 꽃이 피고, 열매 목표를 이루면 열매가 열린다. */
export const FERN_STAGE_LABELS: Record<PlantStage, string> = {
  seed: "씨앗",
  sprout: "새순",
  sapling: "어린 잎",
  tree: "고사리",
  bloom: "꽃·열매",
};

/** 화분 색 (포트폴리오 구분). 씨앗 아바타(`lib/seed-identity/seed-avatar.ts`) 톤에 맞춘 파스텔. */
export const POT_COLORS = {
  terracotta: { body: "#C9714A", rim: "#B35F3A" },
  cream: { body: "#E8D6BC", rim: "#D6BF9F" },
  sky: { body: "#86B4E3", rim: "#6B9CD0" },
  lavender: { body: "#A996E6", rim: "#937DD6" },
  sun: { body: "#EDBE4F", rim: "#D9A630" },
} as const;
export type PotColor = keyof typeof POT_COLORS;
export const POT_COLOR_IDS = Object.keys(POT_COLORS) as PotColor[];

/** 리밸런싱 배지가 화면에 보이는 크기와 누르는 영역 (CSS px, 정원 전체·포커스 모두 같은 크기). */
export const REBALANCE_BADGE_PX = 30;
export const REBALANCE_BADGE_HIT_PX = 44;
/** 리밸런싱 배지 색. 2D 목록의 `!` 표시도 같은 색을 쓴다. */
export const REBALANCE_BADGE_COLOR = "#E8664F";

/** 시듦이 이 값 이상이면 잎 일부(`WILT_SHED_SHARE`)가 떨어진다 (시듦 3단계, 이탈 28일~). */
export const WILT_SHED_FROM = 0.9;
export const WILT_SHED_SHARE = 0.3;

/**
 * 시듦 → 모양이 늘어지는 정도 (0~1). 첫 단계(0.35)는 색만 바래고 거의 서 있고, 둘째 단계(0.7)부터 다 늘어진다.
 * 색은 시듦 값 그대로 섞는다.
 */
export function wiltSag(wilt: number): number {
  return Math.min(1, Math.max(0, (wilt - 0.25) / 0.45));
}

export interface PlantOptions {
  stage: PlantStage;
  /**
   * 바람 0 (잔잔) ~ 1. 시장 하락 — 흔들림이 크고 빨라지고 한쪽으로 살짝 눕는다. 잎 색·모양은 그대로다.
   * 화면 데이터에서는 `plantWind` 가 0.5 까지만 준다 (예전 처짐의 절반이 상한).
   */
  wind: number;
  /**
   * 시듦 0 (싱싱) ~ 1. 비중 이탈 기간 (`plantWilt`: 7·14·28일 → 0.35·0.7·1) — 잎이 누렇게 바래고 늘어지고,
   * `WILT_SHED_FROM` 이상이면 잎 일부가 떨어진다. 단계(크기)는 그대로다.
   */
  wilt: number;
  /**
   * 열매가 열림 (= 수확할 수 있음). 꽃·열매 단계에서만 보인다 — 4단계는 꽃만 피고, 열매 목표를 이루면
   * 열매가 열린다. 익어 가는 중간 모습은 없다.
   */
  ripe: boolean;
  /** 리밸런싱이 필요하면 몸통이 한쪽으로 기울고 옆에 원형 `!` 배지가 뜬다. */
  needsRebalance: boolean;
  pot: PotColor;
  /** 잎·가지 배치를 바꾸는 시드. 포트폴리오마다 모양이 조금씩 다르게. */
  seed: number;
  /** 식물 종류. 없으면 `tree`. */
  kind?: PlantKind;
}

export const DEFAULT_PLANT_OPTIONS: PlantOptions = {
  stage: "sapling",
  wind: 0,
  wilt: 0,
  ripe: false,
  needsRebalance: false,
  pot: "terracotta",
  seed: 7,
};
