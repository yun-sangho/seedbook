"use client";

import { useState } from "react";
import { Button } from "@web/components/ui/button";
import { SortableItem } from "@web/components/ui/sortable-item";
import { SortableList } from "@web/components/ui/sortable-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@web/components/ui/tabs";
import { useDebtsStore } from "@web/features/debts/stores/debts-store";
import { useIsReadOnly } from "@web/features/sharing/hooks/use-is-read-only";
import { CreditCard, Plus } from "lucide-react";
import { AddDebtModal } from "./add-debt-modal";
import { DebtTab } from "./constants";
import { DebtItemComponent } from "./debt-item";
import { DebtSummary } from "./debt-summary";

function EmptyState({ onAddDebt, readOnly }: { onAddDebt: () => void; readOnly: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 border-2 border-dashed rounded-lg">
      <div className="flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4">
        <CreditCard className="w-8 h-8 text-primary" />
      </div>
      <h3 className="text-lg font-semibold mb-2">대출이 없습니다</h3>
      <p className="text-muted-foreground text-sm text-center mb-6 max-w-md">
        {readOnly ? (
          "아직 등록된 대출이 없습니다."
        ) : (
          <>
            첫 대출을 추가하고 부채를 관리해보세요.
            <br />
            주택담보대출, 신용대출 등 다양한 대출을 추적할 수 있습니다.
          </>
        )}
      </p>
      {!readOnly && (
        <Button onClick={onAddDebt} size="lg">
          <Plus className="h-5 w-5" />첫 대출 추가하기
        </Button>
      )}
    </div>
  );
}

export function DebtManager() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DebtTab>(DebtTab.ACOUNTS);
  const isReadOnly = useIsReadOnly();

  const loans = useDebtsStore((state) => state.debts);
  const updateDebt = useDebtsStore((state) => state.updateDebt);
  const removeDebt = useDebtsStore((state) => state.removeDebt);
  const reorderDebts = useDebtsStore((state) => state.reorderDebts);

  const openAddDebtModal = () => {
    setIsModalOpen(true);
  };

  const closeAddDebtModal = () => {
    setIsModalOpen(false);
  };

  const handleDebtAdded = () => {
    setActiveTab(DebtTab.ACOUNTS);
  };

  // Show empty state when no debts
  if (loans.length === 0) {
    return (
      <>
        <EmptyState onAddDebt={openAddDebtModal} readOnly={isReadOnly} />
        <AddDebtModal
          isOpen={isModalOpen}
          onClose={closeAddDebtModal}
          onDebtAdded={handleDebtAdded}
        />
      </>
    );
  }

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as DebtTab)}
      className="w-full gap-4"
    >
      <div className="w-full flex justify-between">
        <TabsList>
          <TabsTrigger value={DebtTab.ACOUNTS}>대출 관리</TabsTrigger>
          <TabsTrigger value={DebtTab.STATISTICS}>통계</TabsTrigger>
        </TabsList>
        {!isReadOnly && (
          <Button onClick={openAddDebtModal} className="ml-auto">
            <Plus className="h-4 w-4" />
            대출 추가
          </Button>
        )}
      </div>

      <TabsContent value={DebtTab.STATISTICS}>
        <DebtSummary loans={loans} />
      </TabsContent>

      <TabsContent value={DebtTab.ACOUNTS}>
        <SortableList
          items={loans}
          onReorder={reorderDebts}
          getItemId={(item) => item.id}
          renderDragOverlay={(activeId) => {
            const item = loans.find((loan) => loan.id === activeId);
            return item ? (
              <div className="bg-secondary rounded-xl p-6 shadow-lg opacity-90">
                <h3 className="text-lg font-semibold">{item.loanName}</h3>
              </div>
            ) : null;
          }}
        >
          {loans.map((item) => (
            <SortableItem key={item.id} id={item.id}>
              <DebtItemComponent item={item} onUpdateDebt={updateDebt} onRemoveDebt={removeDebt} />
            </SortableItem>
          ))}
        </SortableList>
      </TabsContent>

      <AddDebtModal
        isOpen={isModalOpen}
        onClose={closeAddDebtModal}
        onDebtAdded={handleDebtAdded}
      />
    </Tabs>
  );
}
