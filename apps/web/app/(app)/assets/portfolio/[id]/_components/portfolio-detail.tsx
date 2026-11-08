"use client";

import Link from "next/link";
import { Button } from "@web/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@web/components/ui/tabs";
import { PortfolioComparison } from "@web/features/portfolio/components/portfolio-comparison";
import { PortfolioEditor } from "@web/features/portfolio/components/portfolio-editor";
import { usePortfolioStore } from "@web/features/portfolio/stores/portfolio-store";
import { useIsReadOnly } from "@web/features/sharing/hooks/use-is-read-only";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface PortfolioDetailProps {
  id: string;
}

export function PortfolioDetail({ id }: PortfolioDetailProps) {
  const portfolio = usePortfolioStore((s) => s.portfolios.find((p) => p.id === id));
  const removePortfolio = usePortfolioStore((s) => s.removePortfolio);
  const isReadOnly = useIsReadOnly();
  const router = useRouter();

  if (!portfolio) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 border-2 border-dashed rounded-lg">
        <h3 className="text-lg font-semibold mb-2">포트폴리오를 찾을 수 없습니다</h3>
        <p className="text-muted-foreground text-sm text-center mb-6 max-w-md">
          삭제되었거나 잘못된 링크일 수 있습니다.
        </p>
        <Button asChild>
          <Link href="/assets/portfolio">
            <ArrowLeft className="h-4 w-4" />
            포트폴리오 목록으로
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/assets/portfolio">
            <ArrowLeft className="h-4 w-4" />
            목록
          </Link>
        </Button>
        {!isReadOnly && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              if (confirm(`"${portfolio.name}" 포트폴리오를 삭제할까요?`)) {
                removePortfolio(portfolio.id);
                router.push("/assets/portfolio");
              }
            }}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            삭제
          </Button>
        )}
      </div>

      <div className="border rounded-xl bg-card">
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <span
            className="h-3 w-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: portfolio.color }}
          />
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold truncate">{portfolio.name}</h2>
          </div>
        </div>

        <Tabs defaultValue="basic" className="px-4 py-4">
          <TabsList>
            <TabsTrigger value="basic">기본 정보</TabsTrigger>
            <TabsTrigger value="rebalancing">리밸런싱</TabsTrigger>
          </TabsList>
          <TabsContent value="basic" className="mt-4">
            <PortfolioEditor portfolio={portfolio} />
          </TabsContent>
          <TabsContent value="rebalancing" className="mt-4">
            <PortfolioComparison portfolio={portfolio} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
