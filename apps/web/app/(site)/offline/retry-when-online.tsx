"use client";

import { useEffect } from "react";
import { ActionButton } from "@mobile/seed-design/ui/action-button";

/** 다시 시도 버튼 + 연결이 돌아오면 자동 새로고침. */
export function RetryWhenOnline() {
  useEffect(() => {
    const reload = () => window.location.reload();
    window.addEventListener("online", reload);
    return () => window.removeEventListener("online", reload);
  }, []);

  return (
    <ActionButton variant="neutralSolid" onClick={() => window.location.reload()}>
      다시 시도
    </ActionButton>
  );
}
