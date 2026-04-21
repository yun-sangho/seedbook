"use client";

import { useState } from "react";
import { Button } from "@web/components/ui/button";
import { SortableItem } from "@web/components/ui/sortable-item";
import { SortableList } from "@web/components/ui/sortable-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@web/components/ui/tabs";
import { useRealAssetsStore } from "@web/features/real-assets/stores/real-assets-store";
import { useIsReadOnly } from "@web/features/sharing/hooks/use-is-read-only";
import { Building2, Plus } from "lucide-react";
import { AddRealAssetModal } from "./add-real-asset-modal";
import { RealAssetTab } from "./constants";
import { RealAssetItemComponent } from "./real-asset-item";
import { RealAssetsSummary } from "./real-assets-summary";

function EmptyState({ onAddAsset, readOnly }: { onAddAsset: () => void; readOnly: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 border-2 border-dashed rounded-lg">
      <div className="flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4">
        <Building2 className="w-8 h-8 text-primary" />
      </div>
      <h3 className="text-lg font-semibold mb-2">실물자산이 없습니다</h3>
      <p className="text-muted-foreground text-sm text-center mb-6 max-w-md">
        {readOnly ? (
          "아직 등록된 실물자산이 없습니다."
        ) : (
          <>
            첫 실물자산을 추가하고 자산을 관리해보세요.
            <br />
            부동산, 자동차, 귀금속 등 다양한 자산을 추적할 수 있습니다.
          </>
        )}
      </p>
      {!readOnly && (
        <Button onClick={onAddAsset} size="lg">
          <Plus className="h-5 w-5" />첫 실물자산 추가하기
        </Button>
      )}
    </div>
  );
}

export function RealAssetsManager() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<RealAssetTab>(RealAssetTab.ACOUNTS);
  const isReadOnly = useIsReadOnly();

  const realAssets = useRealAssetsStore((state) => state.realAssets);
  const updateRealAsset = useRealAssetsStore((state) => state.updateRealAsset);
  const removeRealAsset = useRealAssetsStore((state) => state.removeRealAsset);
  const reorderRealAssets = useRealAssetsStore((state) => state.reorderRealAssets);

  const openAddAssetModal = () => {
    setIsModalOpen(true);
  };

  const closeAddAssetModal = () => {
    setIsModalOpen(false);
  };

  const handleAssetAdded = () => {
    setActiveTab(RealAssetTab.ACOUNTS);
  };

  // Show empty state when no real assets
  if (realAssets.length === 0) {
    return (
      <>
        <EmptyState onAddAsset={openAddAssetModal} readOnly={isReadOnly} />
        <AddRealAssetModal
          isOpen={isModalOpen}
          onClose={closeAddAssetModal}
          onAssetAdded={handleAssetAdded}
        />
      </>
    );
  }

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as RealAssetTab)}
      className="w-full gap-4"
    >
      <div className="w-full flex justify-between">
        <TabsList>
          <TabsTrigger value={RealAssetTab.ACOUNTS}>자산 관리</TabsTrigger>
          <TabsTrigger value={RealAssetTab.STATISTICS}>통계</TabsTrigger>
        </TabsList>
        {!isReadOnly && (
          <Button onClick={openAddAssetModal} className="ml-auto">
            <Plus className="h-4 w-4" />
            실물자산 추가
          </Button>
        )}
      </div>

      <TabsContent value={RealAssetTab.STATISTICS}>
        <RealAssetsSummary realAssets={realAssets} />
      </TabsContent>

      <TabsContent value={RealAssetTab.ACOUNTS}>
        <SortableList
          items={realAssets}
          onReorder={reorderRealAssets}
          getItemId={(item) => item.id}
          renderDragOverlay={(activeId) => {
            const item = realAssets.find((asset) => asset.id === activeId);
            return item ? (
              <div className="bg-secondary rounded-xl p-6 shadow-lg opacity-90">
                <h3 className="text-lg font-semibold">{item.assetName}</h3>
              </div>
            ) : null;
          }}
        >
          {realAssets.map((item) => (
            <SortableItem key={item.id} id={item.id}>
              <RealAssetItemComponent
                item={item}
                onUpdateAsset={updateRealAsset}
                onRemoveAsset={removeRealAsset}
              />
            </SortableItem>
          ))}
        </SortableList>
      </TabsContent>

      <AddRealAssetModal
        isOpen={isModalOpen}
        onClose={closeAddAssetModal}
        onAssetAdded={handleAssetAdded}
      />
    </Tabs>
  );
}
