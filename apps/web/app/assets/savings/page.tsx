"use client";

import { SavingsManager } from "./_components/savings-manager";

export default function SavingsPage() {
  return (
    <div className="w-full flex flex-col gap-8 py-8">
      <div className="px-6">
        <SavingsManager />
      </div>
    </div>
  );
}
