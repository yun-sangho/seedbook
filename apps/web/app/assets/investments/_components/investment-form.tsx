"use client";

import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { InvestmentItem } from "@web/features/investments/types/types";
import { InvestmentItemComponent } from "./investment-item";

interface InvestmentFormProps {
  handleSubmit: (e: React.FormEvent) => void;
}

export function InvestmentForm({ handleSubmit }: InvestmentFormProps) {
  const investments = useInvestmentStore((state) => state.investments);
  const updateInvestment = useInvestmentStore((state) => state.updateInvestment);
  const removeInvestmentHistoryRecord = useInvestmentStore(
    (state) => state.removeInvestmentHistoryRecord
  );

  const handleChange = (id: number, field: string, value: string) => {
    updateInvestment(id, field as keyof InvestmentItem, value);
  };

  const handleRemoveHistoryRecord = (id: number, date: string) => {
    removeInvestmentHistoryRecord(id, date);
  };

  return (
    <div className="flex flex-col gap-3">
      {investments.map((item) => (
        <InvestmentItemComponent
          key={item.id}
          item={item}
          onUpdateItem={handleChange}
          onRemoveHistoryRecord={handleRemoveHistoryRecord}
        />
      ))}
    </div>
  );
}
