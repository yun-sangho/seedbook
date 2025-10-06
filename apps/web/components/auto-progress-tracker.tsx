"use client";

import { useEffect } from "react";
import { startAutoProgressTracking } from "@web/features/assets/utils/auto-progress-tracker";

/**
 * 자산 변화 자동 추적 초기화 컴포넌트
 *
 * 앱이 마운트될 때 각 store의 변화를 구독하여
 * 자동으로 progress point를 생성합니다.
 */
export function AutoProgressTracker() {
  useEffect(() => {
    // 자동 추적 시작
    const cleanup = startAutoProgressTracking();

    // 컴포넌트 unmount 시 구독 해제
    return cleanup;
  }, []);

  // UI를 렌더링하지 않음 (side-effect only)
  return null;
}
