"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function PlanHeader() {
  return (
    <div className="mb-8">
      <Link
        href="/assets"
        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
      >
        <ChevronLeft className="w-5 h-5" />
        자산 현황으로 돌아가기
      </Link>
    </div>
  );
}
