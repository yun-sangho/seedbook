"use client";

import { useCallback } from "react";
import { useFlow } from "@stackflow/react";
import type { TabActivityName } from "./stackflow";

/**
 * 하단 탭 전환. 탭은 스택 루트를 바꿔 끼우는 것이라 `replace` 하고 전환 애니메이션은 끈다
 * (브라우저 히스토리에도 쌓이지 않는다). 루트 탭 화면에서만 호출한다.
 */
export function useSwitchTab() {
  const { replace } = useFlow();
  return useCallback(
    (name: TabActivityName) => {
      replace(name, {}, { animate: false });
    },
    [replace]
  );
}
