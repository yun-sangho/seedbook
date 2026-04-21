"use client";

import { useViewContextStore } from "@web/features/sharing/stores/view-context-store";

/**
 * 현재 공유받은 사용자의 데이터를 열람 중이라 UI 가 읽기 전용이어야 하는지.
 *
 * 자체 데이터를 보는 중이면 `false`. 컴포넌트가 추가/수정/삭제 버튼을 숨기거나
 * 비활성화할 때 사용한다. 서버는 `/api/sharing/view/[ownerId]/storage/[key]` 가
 * GET 만 허용하므로 쓰기가 새어나가도 오염되지 않지만, UX 차원에서 편집 UI 는
 * 감추는 게 맞다.
 */
export function useIsReadOnly(): boolean {
  return useViewContextStore((s) => s.shared !== null);
}
