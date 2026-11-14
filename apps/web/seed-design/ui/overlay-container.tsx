"use client";

import { createContext, type RefObject, useContext } from "react";

/**
 * 바텀시트·다이얼로그를 portal 할 대상. `AppScreen` 이 자기 루트를 넣어 준다.
 *
 * - 콘텐츠 레이어(AppScreenContent) 안에 그대로 두면 안 된다: 레이어는 transform 이 걸린
 *   스크롤 컨테이너라 position:fixed 인 시트가 스크롤을 따라 움직인다.
 * - body 로 빼도 안 된다: AppScreen 은 화면 단위 포커스 트랩(FocusScope trapped)을 걸어
 *   화면 밖 요소로 간 포커스를 되돌리므로 시트 안 입력에 포커스가 들어가지 않는다.
 * AppScreen 루트는 트랩 안쪽이면서 스크롤·transform 이 없어 시트가 화면 기준으로 고정된다.
 * 컨텍스트가 없으면(AppScreen 밖) Portal 기본값인 body 로 간다.
 */
export const OverlayContainerContext = createContext<RefObject<HTMLElement | null> | undefined>(
  undefined
);

export function useOverlayContainer() {
  return useContext(OverlayContainerContext);
}
