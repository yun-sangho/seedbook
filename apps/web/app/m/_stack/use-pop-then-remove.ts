"use client";

import { useCallback, useEffect, useRef } from "react";
import { useFlow } from "@stackflow/react";

/**
 * 상세 화면에서 자기 자신(계좌·포트폴리오)을 삭제할 때 쓴다. 먼저 화면을 pop 하고,
 * 실제 삭제는 화면이 퇴장 애니메이션을 마치고 언마운트될 때 한다 — 바로 지우면
 * 밀려나는 동안 "찾을 수 없어요" 화면이 비친다.
 */
export function usePopThenRemove(remove: () => void): () => void {
  const { pop } = useFlow();
  const pending = useRef(false);
  const removeRef = useRef(remove);

  useEffect(() => {
    removeRef.current = remove;
  }, [remove]);

  useEffect(
    () => () => {
      if (pending.current) {
        pending.current = false;
        removeRef.current();
      }
    },
    []
  );

  return useCallback(() => {
    pending.current = true;
    pop();
  }, [pop]);
}
