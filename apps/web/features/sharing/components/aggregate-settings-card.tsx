"use client";

import { Button } from "@web/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card";
import { useViewContextStore } from "@web/features/sharing/stores/view-context-store";

/**
 * aggregate 모드의 묶기 설정 카드.
 *
 * 묶기 ON  → 페이지 안에서 owner 별로 섹션이 분리되고 각 섹션이 자체 정렬을 가진다.
 * 묶기 OFF → 모든 항목이 한 리스트로 섞이고 단일 정렬 기준이 적용된다.
 *
 * 사용자별 필터는 각 페이지의 상단 필터 바에서 설정한다 (이 카드와 별개).
 */
export function AggregateSettingsCard() {
  const mode = useViewContextStore((s) => s.mode);
  const grouping = useViewContextStore((s) => s.aggregateGrouping);
  const setGrouping = useViewContextStore((s) => s.setAggregateGrouping);

  if (mode !== "aggregate") return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>합산 보기 설정</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">공유분 묶어 보기</p>
            <p className="text-xs text-muted-foreground">
              켜면 각 페이지에서 owner 별로 섹션을 나눠 따로 정렬합니다. 끄면 내 항목과
              섞어 한 정렬 기준으로 정렬합니다. 사용자별 필터는 양쪽 모두에서 동작합니다.
            </p>
          </div>
          <Button
            size="sm"
            variant={grouping ? "default" : "outline"}
            onClick={() => setGrouping(!grouping)}
            className="shrink-0"
          >
            {grouping ? "묶음 ON" : "묶음 OFF"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
