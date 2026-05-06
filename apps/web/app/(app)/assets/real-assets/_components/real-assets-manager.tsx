"use client";

import { useMemo, useState } from "react";
import { Button } from "@web/components/ui/button";
import { SortableItem } from "@web/components/ui/sortable-item";
import { SortableList } from "@web/components/ui/sortable-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@web/components/ui/tabs";
import { useRealAssetsStore } from "@web/features/real-assets/stores/real-assets-store";
import type { RealAssetItem } from "@web/features/real-assets/types/types";
import { AggregateFilterBar } from "@web/features/sharing/components/aggregate-filter-bar";
import { useIsReadOnly } from "@web/features/sharing/hooks/use-is-read-only";
import { useSharedEnvelopes } from "@web/features/sharing/hooks/use-shared-envelopes";
import {
  SELF_FILTER_ID,
  useViewContextStore,
} from "@web/features/sharing/stores/view-context-store";
import {
  buildSharedGroups,
  makeFilterPredicate,
} from "@web/features/sharing/utils/aggregate-helpers";
import { Building2, Plus } from "lucide-react";
import { AddRealAssetModal } from "./add-real-asset-modal";
import { RealAssetTab } from "./constants";
import { RealAssetItemComponent } from "./real-asset-item";
import { RealAssetsSummary } from "./real-assets-summary";

const READ_ONLY_HANDLERS = {
  onUpdateAsset: () => {},
  onRemoveAsset: () => {},
} as const;

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

  const viewMode = useViewContextStore((s) => s.mode);
  const aggregateOwners = useViewContextStore((s) => s.aggregateOwners);
  const aggregateFilter = useViewContextStore((s) => s.aggregateFilter);
  const aggregateGrouping = useViewContextStore((s) => s.aggregateGrouping);
  const { envelopes: sharedEnvelopes } = useSharedEnvelopes("real-assets-storage");

  const sharedGroups = useMemo(
    () => buildSharedGroups<RealAssetItem>(aggregateOwners, sharedEnvelopes, "realAssets"),
    [aggregateOwners, sharedEnvelopes],
  );
  const isVisible = useMemo(() => makeFilterPredicate(aggregateFilter), [aggregateFilter]);

  const aggregateActive = viewMode === "aggregate" && aggregateOwners.length > 0;
  const showSelf = !aggregateActive || isVisible(SELF_FILTER_ID);

  const openAddAssetModal = () => setIsModalOpen(true);
  const closeAddAssetModal = () => setIsModalOpen(false);
  const handleAssetAdded = () => setActiveTab(RealAssetTab.ACOUNTS);

  const statisticsAssets = useMemo(() => {
    if (!aggregateActive) return realAssets;
    const merged: RealAssetItem[] = [];
    if (showSelf) merged.push(...realAssets);
    for (const g of sharedGroups) {
      if (isVisible(g.ownerId)) merged.push(...g.items);
    }
    return merged;
  }, [aggregateActive, realAssets, sharedGroups, showSelf, isVisible]);

  const totalCount = realAssets.length + sharedGroups.reduce((acc, g) => acc + g.items.length, 0);

  if (totalCount === 0) {
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
        <AggregateFilterBar />
        <RealAssetsSummary realAssets={statisticsAssets} />
      </TabsContent>

      <TabsContent value={RealAssetTab.ACOUNTS}>
        <AggregateFilterBar />

        {showSelf && realAssets.length > 0 && (
          <div className="space-y-2">
            {aggregateActive && aggregateGrouping && (
              <h3 className="text-sm font-semibold text-muted-foreground">내 데이터</h3>
            )}
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
          </div>
        )}

        {aggregateActive &&
          sharedGroups
            .filter((g) => isVisible(g.ownerId) && g.items.length > 0)
            .map((g) => (
              <div key={g.ownerId} className="space-y-2 mt-4">
                {aggregateGrouping && (
                  <h3 className="text-sm font-semibold text-muted-foreground">
                    {g.ownerName}
                    {g.ownerLabel && (
                      <span className="ml-1 text-xs font-normal">· {g.ownerLabel}</span>
                    )}
                  </h3>
                )}
                <div className="space-y-2">
                  {g.items.map((item) => (
                    <RealAssetItemComponent
                      key={`${g.ownerId}:${item.id}`}
                      item={item}
                      readOnly
                      ownerLabel={g.ownerLabel ? `${g.ownerName} · ${g.ownerLabel}` : g.ownerName}
                      {...READ_ONLY_HANDLERS}
                    />
                  ))}
                </div>
              </div>
            ))}
      </TabsContent>

      <AddRealAssetModal
        isOpen={isModalOpen}
        onClose={closeAddAssetModal}
        onAssetAdded={handleAssetAdded}
      />
    </Tabs>
  );
}
