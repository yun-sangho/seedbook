"use client";

import { useState } from "react";
import { Button } from "@web/components/ui/button";
import { SortableItem } from "@web/components/ui/sortable-item";
import { SortableList } from "@web/components/ui/sortable-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@web/components/ui/tabs";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { InvestmentItem } from "@web/features/investments/types/types";
import { AddInvestmentModal } from "./add-investment-modal";
import { InvestmentItemComponent } from "./investment-item";
import { InvestmentSummary } from "./investment-summary";

export function InvestmentForm() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const investments = useInvestmentStore((state) => state.investments);
  const updateInvestment = useInvestmentStore((state) => state.updateInvestment);
  const removeInvestmentHistoryRecord = useInvestmentStore(
    (state) => state.removeInvestmentHistoryRecord
  );
  const addHistoryRecord = useInvestmentStore((state) => state.addHistoryRecord);
  const reorderInvestments = useInvestmentStore((state) => state.reorderInvestments);
  const removeInvestment = useInvestmentStore((state) => state.removeInvestment);

  const handleChange = (id: number, field: string, value: string) => {
    updateInvestment(id, field as keyof InvestmentItem, value);
  };

  const handleRemoveHistoryRecord = (id: number, date: string) => {
    removeInvestmentHistoryRecord(id, date);
  };

  const handleAddHistory = (
    itemId: number,
    date: string,
    initialInvestment: number,
    currentValue: number
  ) => {
    addHistoryRecord(itemId, date, initialInvestment, currentValue);
  };

  const openAddAccountModal = () => {
    setIsModalOpen(true);
  };

  const closeAddAccountModal = () => {
    setIsModalOpen(false);
  };

  return (
    <Tabs defaultValue="summary">
      <div className="w-full flex justify-between">
        <TabsList>
          <TabsTrigger value="summary">요약</TabsTrigger>
          <TabsTrigger value="details">계좌 상세</TabsTrigger>
        </TabsList>
        <Button onClick={openAddAccountModal} className="ml-auto">
          + 투자 계좌 추가
        </Button>
      </div>

      <TabsContent value="summary">
        <InvestmentSummary investments={investments} />
      </TabsContent>

      <TabsContent value="details">
        <SortableList
          items={investments}
          onReorder={reorderInvestments}
          getItemId={(item) => item.id}
          renderDragOverlay={(activeId) => {
            const item = investments.find((inv) => inv.id === activeId);
            return item ? (
              <div className="bg-secondary rounded-xl p-6 shadow-lg opacity-90">
                <h3 className="text-lg font-semibold">{item.accountName}</h3>
              </div>
            ) : null;
          }}
        >
          {investments.map((item) => (
            <SortableItem key={item.id} id={item.id}>
              <InvestmentItemComponent
                item={item}
                onUpdateItem={handleChange}
                onRemoveHistoryRecord={handleRemoveHistoryRecord}
                onAddHistory={handleAddHistory}
                onRemoveInvestment={removeInvestment}
              />
            </SortableItem>
          ))}
        </SortableList>
      </TabsContent>

      <AddInvestmentModal isOpen={isModalOpen} onClose={closeAddAccountModal} />
    </Tabs>
  );
}
