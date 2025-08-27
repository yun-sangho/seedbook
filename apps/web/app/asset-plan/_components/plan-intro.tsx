"use client";

import { Calculator } from "lucide-react";

export function PlanIntro() {
  return (
    <div className="mb-10">
      <h1 className="text-3xl font-bold mb-4 flex items-center gap-3">
        <Calculator className="w-8 h-8 text-blue-600" />
        자산계획 수립
      </h1>
      <p className="text-gray-600 dark:text-gray-400">
        현재 투자 계좌를 기반으로 미래 자산 증가 시뮬레이션을 만들어보세요
      </p>
    </div>
  );
}
