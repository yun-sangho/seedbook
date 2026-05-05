"use client";

import { useViewContextStore } from "@web/features/sharing/stores/view-context-store";

/**
 * 현재 화면 전체가 읽기 전용이어야 하는지 (= full-switch 모드인지).
 *
 * aggregate 모드에서는 내 데이터 편집은 가능하고, 공유분 카드만 개별적으로
 * 잠겨야 한다. 카드 단위 read-only 는 owner badge 가 붙는 컴포넌트가 직접
 * 처리한다.
 */
export function useIsReadOnly(): boolean {
  return useViewContextStore((s) => s.mode === "full-switch" && s.fullSwitch !== null);
}
