"use client";

import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { InvestmentItem } from "@web/features/investments/types/types";
import { InvestmentItemComponent } from "./investment-item";

export function InvestmentForm() {
  const investments = useInvestmentStore((state) => state.investments);
  const updateInvestment = useInvestmentStore((state) => state.updateInvestment);
  const removeInvestmentHistoryRecord = useInvestmentStore(
    (state) => state.removeInvestmentHistoryRecord
  );
  const addHistoryRecord = useInvestmentStore((state) => state.addHistoryRecord);

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

  return (
    <div className="flex flex-col gap-3">
      {investments.map((item) => (
        <InvestmentItemComponent
          key={item.id}
          item={item}
          onUpdateItem={handleChange}
          onRemoveHistoryRecord={handleRemoveHistoryRecord}
          onAddHistory={handleAddHistory}
        />
      ))}
    </div>
  );
}
