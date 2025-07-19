"use client";

import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { DEFAULT_OWNERS } from "@web/features/investments/types/constants";
import { InvestmentItem } from "@web/features/investments/types/types";
import { InvestmentItemComponent } from "./investment-item";

interface InvestmentFormProps {
  handleSubmit: (e: React.FormEvent) => void;
}

export function InvestmentForm({ handleSubmit }: InvestmentFormProps) {
  const investments = useInvestmentStore((state) => state.investments);
  const customOwners = useInvestmentStore((state) => state.customOwners);
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

  const accountOwners = [...DEFAULT_OWNERS, ...customOwners];

  return (
    <div className="flex flex-col gap-3">
      {investments.map((item) => (
        <InvestmentItemComponent
          key={item.id}
          item={item}
          accountOwners={accountOwners}
          onUpdateItem={handleChange}
          onRemoveHistoryRecord={handleRemoveHistoryRecord}
        />
      ))}
    </div>
  );
}
