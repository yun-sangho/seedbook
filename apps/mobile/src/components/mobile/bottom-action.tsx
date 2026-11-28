"use client";

import { createContext, type ReactNode, useContext } from "react";
import { createPortal } from "react-dom";

/** 상세 화면 하단 고정 슬롯. `HeaderActionSlotContext` 처럼 셸이 DOM 을 제공한다. */
export const BottomActionSlotContext = createContext<HTMLElement | null>(null);

/** 화면의 주된 다음 행동을 하단에 고정한다. 안전 영역 여백은 슬롯이 둔다. */
export function BottomAction({ children }: { children: ReactNode }) {
  const slot = useContext(BottomActionSlotContext);
  if (!slot) return null;
  return createPortal(
    <div className="border-stroke-neutral-subtle flex flex-col gap-x2 border-t px-x4 py-x3">
      {children}
    </div>,
    slot
  );
}
