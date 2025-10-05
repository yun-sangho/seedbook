"use client";

import { usePathname } from "next/navigation";
import { Separator } from "@web/components/ui/separator";
import { SidebarTrigger } from "@web/components/ui/sidebar";

const pageNames: Record<string, string> = {
  "/": "홈",
  "/dashboard": "대시보드",
  "/assets": "전체 자산",
  "/assets/investments": "투자",
  "/assets/savings": "저축",
  "/assets/real-assets": "실물 자산",
  "/assets/loans": "대출",
  "/asset-plan": "자산 계획",
  "/asset-plan-list": "계획 목록",
  "/contact": "문의하기",
};

export function AppHeader() {
  const pathname = usePathname();
  const pageName = pageNames[pathname] || "페이지";

  return (
    <header className="w-full sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <h1 className="text-lg font-semibold">{pageName}</h1>
    </header>
  );
}
