import type { RebalancingTaskStatus } from "../types/types";

/** 진행 화면의 매매 섹션 — 상태별 (주문 전 / 주문 중 / 체결됨). */
export type RebalancingTaskSection = RebalancingTaskStatus;

const SECTIONS: readonly RebalancingTaskSection[] = ["pending", "ordered", "filled"];

const isSection = (value: unknown): value is RebalancingTaskSection =>
  SECTIONS.includes(value as RebalancingTaskSection);

/**
 * 접어 둔 섹션 목록을 읽는다. 없어진 섹션 이름이나 중복은 버린다 (예전 캐시·서버 값).
 * 목록이 아니면 null.
 */
export function parseCollapsedSections(value: unknown): RebalancingTaskSection[] | null {
  if (!Array.isArray(value)) return null;
  return [...new Set(value.filter(isSection))];
}

/** 섹션 하나를 접거나 편다. */
export function toggleCollapsedSection(
  collapsed: readonly RebalancingTaskSection[],
  section: RebalancingTaskSection
): RebalancingTaskSection[] {
  return collapsed.includes(section)
    ? collapsed.filter((s) => s !== section)
    : [...collapsed, section];
}
