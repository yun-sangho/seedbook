"use client";

import { useState } from "react";
import { Button } from "@web/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@web/components/ui/dialog";
import { Label } from "@web/components/ui/label";
import { useRealAssetsStore } from "@web/features/real-assets/stores/real-assets-store";
import { RealAssetType } from "@web/features/real-assets/types/constants";

interface AddRealAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAssetAdded?: () => void;
}

export function AddRealAssetModal({ isOpen, onClose, onAssetAdded }: AddRealAssetModalProps) {
  const addRealAsset = useRealAssetsStore((state) => state.addRealAsset);

  const [selectedAssetType, setSelectedAssetType] = useState<string>("");

  const handleAddAsset = () => {
    if (selectedAssetType) {
      addRealAsset({ assetType: selectedAssetType });
      setSelectedAssetType("");
      onClose();
      onAssetAdded?.();
    }
  };

  const handleClose = () => {
    setSelectedAssetType("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>새 실물자산 추가</DialogTitle>
          <DialogDescription>추가할 실물자산의 유형을 선택해주세요.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div>
            <Label className="block mb-3 text-sm font-medium">자산 유형</Label>
            <div className="grid grid-cols-2 gap-2">
              {Object.values(RealAssetType).map((type) => (
                <Button
                  key={type}
                  type="button"
                  size={"lg"}
                  variant={selectedAssetType === type ? "default" : "outline"}
                  onClick={() => setSelectedAssetType(type)}
                >
                  {type}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={handleClose}>
              취소
            </Button>
            <Button onClick={handleAddAsset} disabled={!selectedAssetType}>
              추가하기
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
