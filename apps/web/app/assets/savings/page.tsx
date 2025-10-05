"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SavingsManager } from "./_components/savings-manager";

export default function SavingsPage() {
  return (
    <main className="flex flex-col items-center min-h-screen p-8 md:p-24">
      <div className="w-full max-w-4xl">
        <div className="mb-8">
          <Link
            href="/assets"
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
          >
            <ChevronLeft className="w-5 h-5" />
            돌아가기
          </Link>
        </div>

        <div className="mb-10">
          <h1 className="text-3xl font-bold">예금 관리</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            예금, 적금, 주택청약 계좌를 관리하고 잔액을 추적하세요
          </p>
        </div>

        <SavingsManager />
      </div>
    </main>
  );
}
