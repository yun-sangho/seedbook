"use client";

import { useMemo, useState } from "react";
import { Button } from "@web/components/ui/button";
import { SortableItem } from "@web/components/ui/sortable-item";
import { SortableList } from "@web/components/ui/sortable-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@web/components/ui/tabs";
import { useDebtsStore } from "@web/features/debts/stores/debts-store";
import type { DebtsItem } from "@web/features/debts/types/types";
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
import { CreditCard, Plus } from "lucide-react";
import { AddDebtModal } from "./add-debt-modal";
import { DebtTab } from "./constants";
import { DebtItemComponent } from "./debt-item";
import { DebtSummary } from "./debt-summary";

const READ_ONLY_HANDLERS = {
  onUpdateDebt: () => {},
  onRemoveDebt: () => {},
} as const;

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

  const viewMode = useViewContextStore((s) => s.mode);
  const aggregateOwners = useViewContextStore((s) => s.aggregateOwners);
  const aggregateFilter = useViewContextStore((s) => s.aggregateFilter);
  const aggregateGrouping = useViewContextStore((s) => s.aggregateGrouping);
  const { envelopes: sharedEnvelopes } = useSharedEnvelopes("debts-storage");

  const sharedGroups = useMemo(
    () => buildSharedGroups<DebtsItem>(aggregateOwners, sharedEnvelopes, "debts"),
    [aggregateOwners, sharedEnvelopes],
  );
  const isVisible = useMemo(() => makeFilterPredicate(aggregateFilter), [aggregateFilter]);

  const aggregateActive = viewMode === "aggregate" && aggregateOwners.length > 0;
  const showSelf = !aggregateActive || isVisible(SELF_FILTER_ID);

  const openAddDebtModal = () => {
    setIsModalOpen(true);
  };

  const closeAddDebtModal = () => {
    setIsModalOpen(false);
  };

  const handleDebtAdded = () => {
    setActiveTab(DebtTab.ACOUNTS);
  };

  // 통계 탭에 줄 데이터: aggregate 모드면 필터/공유분 합산.
  const statisticsLoans = useMemo(() => {
    if (!aggregateActive) return loans;
    const merged: DebtsItem[] = [];
    if (showSelf) merged.push(...loans);
    for (const g of sharedGroups) {
      if (isVisible(g.ownerId)) merged.push(...g.items);
    }
    return merged;
  }, [aggregateActive, loans, sharedGroups, showSelf, isVisible]);

  const totalCount = loans.length + sharedGroups.reduce((acc, g) => acc + g.items.length, 0);

  // Show empty state when no debts AND no shared groups
  if (totalCount === 0) {
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
        <AggregateFilterBar />
        <DebtSummary loans={statisticsLoans} />
      </TabsContent>

      <TabsContent value={DebtTab.ACOUNTS}>
        <AggregateFilterBar />

        {showSelf && loans.length > 0 && (
          <div className="space-y-2">
            {aggregateActive && aggregateGrouping && (
              <h3 className="text-sm font-semibold text-muted-foreground">내 데이터</h3>
            )}
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
                  <DebtItemComponent
                    item={item}
                    onUpdateDebt={updateDebt}
                    onRemoveDebt={removeDebt}
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
              <div key={g.ownerId} className="space-y-2 mt-4">
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
                    <DebtItemComponent
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

      <AddDebtModal
        isOpen={isModalOpen}
        onClose={closeAddDebtModal}
        onDebtAdded={handleDebtAdded}
      />
    </Tabs>
  );
}
