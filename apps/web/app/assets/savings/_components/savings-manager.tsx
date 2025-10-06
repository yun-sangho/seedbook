"use client";

import { useState } from "react";
import { Button } from "@web/components/ui/button";
import { Card, CardContent } from "@web/components/ui/card";
import { SortableItem } from "@web/components/ui/sortable-item";
import { SortableList } from "@web/components/ui/sortable-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@web/components/ui/tabs";
import { useSavingsStore } from "@web/features/savings/stores/savings-store";
import { Plus } from "lucide-react";
import { AddSavingsModal } from "./add-savings-modal";
import { SavingtTab } from "./constants";
import { SavingsItemComponent } from "./savings-item";
import { SavingsSummary } from "./savings-summary";

export function SavingsManager() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<SavingtTab>(SavingtTab.ACOUNTS);

  const savings = useSavingsStore((state) => state.savings);
  const updateSavings = useSavingsStore((state) => state.updateSavings);
  const removeSavings = useSavingsStore((state) => state.removeSavings);
  const reorderSavings = useSavingsStore((state) => state.reorderSavings);
  const addHistoryRecord = useSavingsStore((state) => state.addHistoryRecord);
  const removeSavingsHistoryRecord = useSavingsStore((state) => state.removeSavingsHistoryRecord);

  // 빈 상태 처리
  if (savings.length === 0) {
    return (
      <>
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">아직 등록된 저축 계좌가 없습니다.</p>
              <Button onClick={() => setIsModalOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />첫 저축 계좌 추가하기
              </Button>
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
  const handleUpdateItem = (
    id: number,
    field: keyof import("@web/features/savings/types/types").SavingsItem,
    value: string
  ) => {
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

          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="h-4 w-4" />
            저축 계좌 추가
          </Button>
        </div>

        {/* 요약 탭 */}
        <TabsContent value={SavingtTab.STATISTICS}>
          <SavingsSummary />
        </TabsContent>

        {/* 계좌 상세 탭 */}
        <TabsContent value={SavingtTab.ACOUNTS} className="space-y-4">
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
