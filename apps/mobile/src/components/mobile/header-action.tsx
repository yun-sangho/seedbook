"use client";

import { createContext, type ReactNode, useContext } from "react";
import { createPortal } from "react-dom";

/**
 * 모바일 앱바 오른쪽 슬롯. 셸이 슬롯 DOM 을 제공하고, 화면은 `<HeaderAction>` 으로
 * 버튼을 넣는다. 버튼이 여는 시트 상태는 화면 쪽에 그대로 남는다 (portal).
 */
export const HeaderActionSlotContext = createContext<HTMLElement | null>(null);

export function HeaderAction({ children }: { children: ReactNode }) {
  const slot = useContext(HeaderActionSlotContext);
  return slot ? createPortal(children, slot) : null;
}
