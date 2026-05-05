"use client";

import { Button } from "@web/components/ui/button";
import { useViewContextStore } from "@web/features/sharing/stores/view-context-store";
import { Eye, X } from "lucide-react";

/**
 * full-switch 모드 전용 배너. aggregate 모드에서는 owner badge 가 카드 단위로
 * 표시되므로 이 배너는 띄우지 않는다.
 */
export function SharedViewBanner() {
  const mode = useViewContextStore((s) => s.mode);
  const fullSwitch = useViewContextStore((s) => s.fullSwitch);
  const exitFullSwitch = useViewContextStore((s) => s.exitFullSwitch);

  if (mode !== "full-switch" || !fullSwitch) return null;

  const display = fullSwitch.label
    ? `${fullSwitch.ownerName} · ${fullSwitch.label}`
    : fullSwitch.ownerName;

  return (
    <div className="flex items-center justify-between gap-3 bg-amber-100 border-b border-amber-300 px-4 py-2 text-sm text-amber-900 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-100">
      <div className="flex items-center gap-2 min-w-0">
        <Eye className="w-4 h-4 shrink-0" />
        <span className="truncate">
          <strong className="font-semibold">{display}</strong>
          님의 데이터를 읽기 전용으로 열람 중입니다.
        </span>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={exitFullSwitch}
        className="shrink-0 bg-white/70 dark:bg-transparent"
      >
        <X className="w-3.5 h-3.5 mr-1" />내 데이터로 돌아가기
      </Button>
    </div>
  );
}
