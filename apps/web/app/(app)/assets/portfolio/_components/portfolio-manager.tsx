"use client";

import { Button } from "@web/components/ui/button";
import { PortfolioList } from "@web/features/portfolio/components/portfolio-list";
import { usePortfolioStore } from "@web/features/portfolio/stores/portfolio-store";
import { useIsReadOnly } from "@web/features/sharing/hooks/use-is-read-only";
import { PieChart, Plus } from "lucide-react";

function EmptyState({ onAdd, readOnly }: { onAdd: () => void; readOnly: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 border-2 border-dashed rounded-lg">
      <div className="flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4">
        <PieChart className="w-8 h-8 text-primary" />
      </div>
      <h3 className="text-lg font-semibold mb-2">아직 포트폴리오가 없습니다</h3>
      <p className="text-muted-foreground text-sm text-center mb-6 max-w-md">
        {readOnly
          ? "아직 등록된 포트폴리오가 없습니다."
          : "한국 주식 종목으로 목표 비중을 정의하고, 실제 보유와 비교해 리밸런싱 계획을 세워보세요."}
      </p>
      {!readOnly && (
        <Button onClick={onAdd} size="lg">
          <Plus className="h-5 w-5" />첫 포트폴리오 만들기
        </Button>
      )}
    </div>
  );
}

export function PortfolioManager() {
  const portfolios = usePortfolioStore((s) => s.portfolios);
  const addPortfolio = usePortfolioStore((s) => s.addPortfolio);
  const isReadOnly = useIsReadOnly();

  if (portfolios.length === 0) {
    return <EmptyState onAdd={() => addPortfolio()} readOnly={isReadOnly} />;
  }

  return (
    <div className="space-y-4">
      {!isReadOnly && (
        <div className="flex justify-end">
          <Button onClick={() => addPortfolio()}>
            <Plus className="h-4 w-4" />
            포트폴리오 추가
          </Button>
        </div>
      )}
      <PortfolioList portfolios={portfolios} />
    </div>
  );
}
