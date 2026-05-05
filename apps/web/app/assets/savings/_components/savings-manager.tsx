"use client";

import { useMemo, useState } from "react";
import { Button } from "@web/components/ui/button";
import { Card, CardContent } from "@web/components/ui/card";
import { SortableItem } from "@web/components/ui/sortable-item";
import { SortableList } from "@web/components/ui/sortable-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@web/components/ui/tabs";
import { useSavingsStore } from "@web/features/savings/stores/savings-store";
import type { SavingsItem } from "@web/features/savings/types/types";
import { AggregateFilterBar } from "@web/features/sharing/components/aggregate-filter-bar";
import { useIsReadOnly } from "@web/features/sharing/hooks/use-is-read-only";
import { useSharedEnvelopes } from "@web/features/sharing/hooks/use-shared-envelopes";
import {
  SELF_FILTER_ID,
  useViewContextStore,
} from "@web/features/sharing/stores/view-context-store";
import {
  buildSharedGroups,
  makeFilterPredicate,
} from "@web/features/sharing/utils/aggregate-helpers";
import { Plus } from "lucide-react";
import { AddSavingsModal } from "./add-savings-modal";
import { SavingtTab } from "./constants";
import { SavingsItemComponent } from "./savings-item";
import { SavingsSummary } from "./savings-summary";

const READ_ONLY_HANDLERS = {
  onUpdateItem: () => {},
  onRemoveHistoryRecord: () => {},
  onAddHistory: () => {},
  onRemoveSavings: () => {},
} as const;

export function SavingsManager() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<SavingtTab>(SavingtTab.ACOUNTS);
  const isReadOnly = useIsReadOnly();

  const savings = useSavingsStore((state) => state.savings);
  const updateSavings = useSavingsStore((state) => state.updateSavings);
  const removeSavings = useSavingsStore((state) => state.removeSavings);
  const reorderSavings = useSavingsStore((state) => state.reorderSavings);
  const addHistoryRecord = useSavingsStore((state) => state.addHistoryRecord);
  const removeSavingsHistoryRecord = useSavingsStore((state) => state.removeSavingsHistoryRecord);

  const viewMode = useViewContextStore((s) => s.mode);
  const aggregateOwners = useViewContextStore((s) => s.aggregateOwners);
  const aggregateFilter = useViewContextStore((s) => s.aggregateFilter);
  const aggregateGrouping = useViewContextStore((s) => s.aggregateGrouping);
  const { envelopes: sharedEnvelopes } = useSharedEnvelopes("savings-storage");

  const sharedGroups = useMemo(
    () => buildSharedGroups<SavingsItem>(aggregateOwners, sharedEnvelopes, "savings"),
    [aggregateOwners, sharedEnvelopes],
  );
  const isVisible = useMemo(() => makeFilterPredicate(aggregateFilter), [aggregateFilter]);

  const aggregateActive = viewMode === "aggregate" && aggregateOwners.length > 0;
  const showSelf = !aggregateActive || isVisible(SELF_FILTER_ID);

  // 빈 상태 처리
  const totalCount = savings.length + sharedGroups.reduce((acc, g) => acc + g.items.length, 0);
  if (totalCount === 0) {
    return (
      <>
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">아직 등록된 저축 계좌가 없습니다.</p>
              {!isReadOnly && (
                <Button onClick={() => setIsModalOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />첫 저축 계좌 추가하기
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <AddSavingsModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSavingsAdded={() => setActiveTab(SavingtTab.ACOUNTS)}
        />
      </>
    );
  }

  // 계좌 정보 업데이트 핸들러
  const handleUpdateItem = (id: string, field: keyof SavingsItem, value: string) => {
    updateSavings(id, field, value as never);
  };

  // 계좌 추가 후 핸들러
  const handleSavingsAdded = () => {
    setActiveTab(SavingtTab.ACOUNTS); // 계좌 상세 탭으로 자동 전환
  };

  return (
    <>
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as SavingtTab)}
        className="w-full gap-4"
      >
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value={SavingtTab.ACOUNTS}>계좌 관리</TabsTrigger>
            <TabsTrigger value={SavingtTab.STATISTICS}>요약</TabsTrigger>
          </TabsList>

          {!isReadOnly && (
            <Button onClick={() => setIsModalOpen(true)}>
              <Plus className="h-4 w-4" />
              저축 계좌 추가
            </Button>
          )}
        </div>

        {/* 요약 탭 */}
        <TabsContent value={SavingtTab.STATISTICS}>
          <AggregateFilterBar />
          <SavingsSummary />
        </TabsContent>

        {/* 계좌 상세 탭 */}
        <TabsContent value={SavingtTab.ACOUNTS} className="space-y-4">
          <AggregateFilterBar />

          {showSelf && savings.length > 0 && (
            <div className="space-y-2">
              {aggregateActive && aggregateGrouping && (
                <h3 className="text-sm font-semibold text-muted-foreground">내 데이터</h3>
              )}
              <SortableList
                items={savings}
                onReorder={reorderSavings}
                getItemId={(item) => item.id}
                renderDragOverlay={(activeId) => {
                  const item = savings.find((s) => s.id === activeId);
                  return item ? (
                    <div className="bg-secondary rounded-xl p-6 shadow-lg opacity-90">
                      <h3 className="text-lg font-semibold">{item.accountName}</h3>
                    </div>
                  ) : null;
                }}
              >
                {savings.map((item) => (
                  <SortableItem key={item.id} id={item.id}>
                    <SavingsItemComponent
                      item={item}
                      onUpdateItem={handleUpdateItem}
                      onRemoveHistoryRecord={removeSavingsHistoryRecord}
                      onAddHistory={addHistoryRecord}
                      onRemoveSavings={removeSavings}
                    />
                  </SortableItem>
                ))}
              </SortableList>
            </div>
          )}

          {aggregateActive &&
            sharedGroups
              .filter((g) => isVisible(g.ownerId) && g.items.length > 0)
              .map((g) => (
                <div key={g.ownerId} className="space-y-2">
                  {aggregateGrouping && (
                    <h3 className="text-sm font-semibold text-muted-foreground">
                      {g.ownerName}
                      {g.ownerLabel && (
                        <span className="ml-1 text-xs font-normal">· {g.ownerLabel}</span>
                      )}
                    </h3>
                  )}
                  <div className="space-y-2">
                    {g.items.map((item) => (
                      <SavingsItemComponent
                        key={`${g.ownerId}:${item.id}`}
                        item={item}
                        readOnly
                        ownerLabel={g.ownerLabel ? `${g.ownerName} · ${g.ownerLabel}` : g.ownerName}
                        {...READ_ONLY_HANDLERS}
                      />
                    ))}
                  </div>
                </div>
              ))}
        </TabsContent>
      </Tabs>

      <AddSavingsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSavingsAdded={handleSavingsAdded}
      />
    </>
  );
}
