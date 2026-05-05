"use client";

import { Button } from "@web/components/ui/button";
import {
  SELF_FILTER_ID,
  useViewContextStore,
} from "@web/features/sharing/stores/view-context-store";
import { Layers } from "lucide-react";

/**
 * aggregate 모드에서 각 페이지 상단에 표시되는 필터 + 묶기 토글 바.
 *
 * - 필터: `__self__` 와 active aggregate owner 들의 토글. 비어 있으면 모두 표시.
 * - 묶기: 묶음 ON/OFF 토글 (설정 카드와 동일 store).
 *
 * full-switch 모드거나 aggregate owner 가 없으면 렌더하지 않는다 — 단일 사용자 뷰에선
 * 굳이 필터 바를 띄울 필요가 없음.
 */
export function AggregateFilterBar() {
  const mode = useViewContextStore((s) => s.mode);
  const aggregateOwners = useViewContextStore((s) => s.aggregateOwners);
  const filter = useViewContextStore((s) => s.aggregateFilter);
  const toggleFilter = useViewContextStore((s) => s.toggleAggregateFilter);
  const grouping = useViewContextStore((s) => s.aggregateGrouping);
  const setGrouping = useViewContextStore((s) => s.setAggregateGrouping);

  if (mode !== "aggregate" || aggregateOwners.length === 0) return null;

  // 필터가 비어 있으면 모두 표시 — UI 상으로는 모든 칩이 active 로 보임.
  const isShown = (id: string) => filter.length === 0 || filter.includes(id);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-3 p-2 rounded-lg border bg-muted/30">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground mr-1">필터</span>
        <Button
          size="sm"
          variant={isShown(SELF_FILTER_ID) ? "default" : "outline"}
          onClick={() => toggleFilter(SELF_FILTER_ID)}
          className="h-7 text-xs"
        >
          내 데이터
        </Button>
        {aggregateOwners.map((owner) => (
          <Button
            key={owner.ownerId}
            size="sm"
            variant={isShown(owner.ownerId) ? "default" : "outline"}
            onClick={() => toggleFilter(owner.ownerId)}
            className="h-7 text-xs"
            title={owner.label ?? undefined}
          >
            {owner.ownerName}
          </Button>
        ))}
      </div>
      <Button
        size="sm"
        variant={grouping ? "default" : "outline"}
        onClick={() => setGrouping(!grouping)}
        className="h-7 text-xs"
      >
        <Layers className="w-3.5 h-3.5 mr-1" />
        {grouping ? "묶음 ON" : "묶음 OFF"}
      </Button>
    </div>
  );
}
