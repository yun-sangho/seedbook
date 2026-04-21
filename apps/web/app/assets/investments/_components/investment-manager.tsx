"use client";

import { useState } from "react";
import { Button } from "@web/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@web/components/ui/select";
import { SortableItem } from "@web/components/ui/sortable-item";
import { SortableList } from "@web/components/ui/sortable-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@web/components/ui/tabs";
import {
  useInvestmentStore,
  type HoldingsSortOption,
} from "@web/features/investments/stores/investment-store";
import { InvestmentItem } from "@web/features/investments/types/types";
import { useIsReadOnly } from "@web/features/sharing/hooks/use-is-read-only";
import { Plus, TrendingUp } from "lucide-react";
import { AddInvestmentModal } from "./add-investment-modal";
import { InvestmentTab } from "./constants";
import { InvestmentItemComponent } from "./investment-item";
import { InvestmentSummary } from "./investment-summary";

function EmptyState({ onAddAccount, readOnly }: { onAddAccount: () => void; readOnly: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 border-2 border-dashed rounded-lg">
      <div className="flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4">
        <TrendingUp className="w-8 h-8 text-primary" />
      </div>
      <h3 className="text-lg font-semibold mb-2">투자 계좌가 없습니다</h3>
      <p className="text-muted-foreground text-sm text-center mb-6 max-w-md">
        {readOnly ? (
          "아직 등록된 투자 계좌가 없습니다."
        ) : (
          <>
            첫 투자 계좌를 추가하고 자산의 성장을 추적해보세요.
            <br />
            다양한 투자 계좌를 한 곳에서 관리할 수 있습니다.
          </>
        )}
      </p>
      {!readOnly && (
        <Button onClick={onAddAccount} size="lg">
          <Plus className="h-5 w-5" />첫 투자 계좌 추가하기
        </Button>
      )}
    </div>
  );
}

export function InvestmentManager() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<InvestmentTab>(InvestmentTab.ACOUNTS);
  const isReadOnly = useIsReadOnly();

  const investments = useInvestmentStore((state) => state.investments);
  const updateInvestment = useInvestmentStore((state) => state.updateInvestment);
  const removeInvestmentHistoryRecord = useInvestmentStore(
    (state) => state.removeInvestmentHistoryRecord
  );
  const addHistoryRecord = useInvestmentStore((state) => state.addHistoryRecord);
  const reorderInvestments = useInvestmentStore((state) => state.reorderInvestments);
  const removeInvestment = useInvestmentStore((state) => state.removeInvestment);
  const addStockHolding = useInvestmentStore((state) => state.addStockHolding);
  const updateStockHolding = useInvestmentStore((state) => state.updateStockHolding);
  const setStockHoldingFromSearch = useInvestmentStore((state) => state.setStockHoldingFromSearch);
  const removeStockHolding = useInvestmentStore((state) => state.removeStockHolding);
  const addCashItem = useInvestmentStore((state) => state.addCashItem);
  const updateCashItem = useInvestmentStore((state) => state.updateCashItem);
  const removeCashItem = useInvestmentStore((state) => state.removeCashItem);
  const holdingsSortOption = useInvestmentStore((state) => state.holdingsSortOption);
  const setHoldingsSortOption = useInvestmentStore((state) => state.setHoldingsSortOption);

  const handleChange = (id: string, field: string, value: string) => {
    updateInvestment(id, field as keyof InvestmentItem, value);
  };

  const handleRemoveHistoryRecord = (id: string, date: string) => {
    removeInvestmentHistoryRecord(id, date);
  };

  const handleAddHistory = (
    itemId: string,
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

  const handleInvestmentAdded = () => {
    setActiveTab(InvestmentTab.ACOUNTS);
  };

  // Show empty state when no investments
  if (investments.length === 0) {
    return (
      <>
        <EmptyState onAddAccount={openAddAccountModal} readOnly={isReadOnly} />
        <AddInvestmentModal
          isOpen={isModalOpen}
          onClose={closeAddAccountModal}
          onInvestmentAdded={handleInvestmentAdded}
        />
      </>
    );
  }

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as InvestmentTab)}
      className="w-full gap-4"
    >
      <div className="w-full flex justify-between">
        <TabsList>
          <TabsTrigger value={InvestmentTab.ACOUNTS}>계좌 관리</TabsTrigger>
          <TabsTrigger value={InvestmentTab.STATISTICS}>통계</TabsTrigger>
        </TabsList>
        {!isReadOnly && (
          <Button onClick={openAddAccountModal} className="ml-auto">
            <Plus className="h-4 w-4" />
            투자 계좌 추가
          </Button>
        )}
      </div>

      <TabsContent value={InvestmentTab.STATISTICS}>
        <InvestmentSummary investments={investments} />
      </TabsContent>

      <TabsContent value={InvestmentTab.ACOUNTS}>
        <div className="flex justify-end mb-3">
          <Select
            value={holdingsSortOption}
            onValueChange={(value) => setHoldingsSortOption(value as HoldingsSortOption)}
          >
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="보유 주식 정렬" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">기본 순서</SelectItem>
              <SelectItem value="priceDesc">주당가 높은 순</SelectItem>
              <SelectItem value="priceAsc">주당가 낮은 순</SelectItem>
              <SelectItem value="evalDesc">평가액 높은 순</SelectItem>
              <SelectItem value="evalAsc">평가액 낮은 순</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
                onAddStockHolding={addStockHolding}
                onUpdateStockHolding={updateStockHolding}
                onSetStockHoldingFromSearch={setStockHoldingFromSearch}
                onRemoveStockHolding={removeStockHolding}
                onAddCashItem={addCashItem}
                onUpdateCashItem={updateCashItem}
                onRemoveCashItem={removeCashItem}
              />
            </SortableItem>
          ))}
        </SortableList>
      </TabsContent>

      <AddInvestmentModal
        isOpen={isModalOpen}
        onClose={closeAddAccountModal}
        onInvestmentAdded={handleInvestmentAdded}
      />
    </Tabs>
  );
}
