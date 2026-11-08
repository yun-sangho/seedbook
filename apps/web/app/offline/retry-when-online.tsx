"use client";

import { useEffect } from "react";
import { Button } from "@web/components/ui/button";

/** 다시 시도 버튼 + 연결이 돌아오면 자동 새로고침. */
export function RetryWhenOnline() {
  useEffect(() => {
    const reload = () => window.location.reload();
    window.addEventListener("online", reload);
    return () => window.removeEventListener("online", reload);
  }, []);

  return <Button onClick={() => window.location.reload()}>다시 시도</Button>;
}
