"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Divider } from "@seed-design/react";
import { ConfirmDialog } from "@web/components/mobile/confirm-dialog";
import { usePortfolioStore } from "@web/features/portfolio/stores/portfolio-store";
import { useIsReadOnly } from "@web/features/sharing/hooks/use-is-read-only";
import { ActionButton } from "@web/seed-design/ui/action-button";
import { ResultSection } from "@web/seed-design/ui/result-section";
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from "@web/seed-design/ui/tabs";
import { PortfolioEditorMobile } from "./portfolio-editor-mobile";
import { PortfolioRebalancingMobile } from "./portfolio-rebalancing-mobile";

type Tab = "rebalancing" | "settings";

export function PortfolioDetailMobile({ id }: { id: string }) {
  const portfolio = usePortfolioStore((s) => s.portfolios.find((p) => p.id === id));
  const removePortfolio = usePortfolioStore((s) => s.removePortfolio);
  const readOnly = useIsReadOnly();
  const router = useRouter();

  // 새로 만든(비어 있는) 포트폴리오는 설정부터, 그 외에는 자주 보는 리밸런싱부터.
  const [tab, setTab] = useState<Tab>(() =>
    portfolio && portfolio.allocations.length > 0 ? "rebalancing" : "settings"
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!portfolio) {
    return (
      <div className="flex min-h-[60dvh] flex-col">
        <ResultSection
          title="포트폴리오를 찾을 수 없어요"
          description="삭제되었거나 잘못된 링크일 수 있습니다."
          primaryActionProps={{
            children: "포트폴리오 목록으로",
            onClick: () => router.push("/assets/portfolio"),
          }}
        />
      </div>
    );
  }

  return (
    <TabsRoot
      value={tab}
      onValueChange={(value) => setTab(value as Tab)}
      triggerLayout="fill"
      stickyList
    >
      <TabsList className="bg-bg-layer-default">
        <TabsTrigger value="rebalancing">리밸런싱</TabsTrigger>
        <TabsTrigger value="settings">설정</TabsTrigger>
      </TabsList>
      <TabsContent value="rebalancing" className="pb-x4">
        <PortfolioRebalancingMobile portfolio={portfolio} />
      </TabsContent>
      <TabsContent value="settings" className="pb-x4">
        <PortfolioEditorMobile portfolio={portfolio} readOnly={readOnly} />
        {!readOnly && (
          <>
            <Divider />
            <div className="flex justify-center pt-x4">
              <ActionButton variant="ghost" size="small" onClick={() => setConfirmDelete(true)}>
                포트폴리오 삭제
              </ActionButton>
            </div>
          </>
        )}
      </TabsContent>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`"${portfolio.name}" 포트폴리오를 삭제할까요?`}
        description="목표 비중과 메모가 모두 삭제됩니다."
        onConfirm={() => {
          removePortfolio(portfolio.id);
          router.push("/assets/portfolio");
        }}
      />
    </TabsRoot>
  );
}
