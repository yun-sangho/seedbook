"use client";

import { Button } from "@web/components/ui/button";
import { useViewContextStore } from "@web/features/sharing/stores/view-context-store";
import { Eye, X } from "lucide-react";

/**
 * 공유받은 사용자의 데이터를 열람 중일 때 화면 상단에 고정 표시되는 배너.
 *
 * - 소유자 이름과 라벨(있으면)을 표시
 * - "내 데이터로 돌아가기" 버튼을 눌러 공유 모드 종료 (스토어가 reload 트리거)
 */
export function SharedViewBanner() {
  const shared = useViewContextStore((s) => s.shared);
  const exitShared = useViewContextStore((s) => s.exitShared);

  if (!shared) return null;

  const display = shared.label ? `${shared.ownerName} · ${shared.label}` : shared.ownerName;

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
        onClick={exitShared}
        className="shrink-0 bg-white/70 dark:bg-transparent"
      >
        <X className="w-3.5 h-3.5 mr-1" />내 데이터로 돌아가기
      </Button>
    </div>
  );
}
