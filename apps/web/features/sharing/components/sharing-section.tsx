"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card";
import { getStorageMode, type StorageMode } from "@web/lib/storage-mode";
import { Cloud } from "lucide-react";
import { MySharesCard } from "./my-shares-card";
import { ReceivedSharesCard } from "./received-shares-card";

/**
 * 데이터 공유 섹션 (관리 페이지용).
 *
 * 클라우드 모드일 때만 본 기능이 의미가 있으므로 (로컬 모드는 서버에 데이터가
 * 없음) 현재 모드가 "cloud" 가 아니면 안내 카드만 표시한다.
 */
export function SharingSection() {
  const [mode, setMode] = useState<StorageMode | null>(null);

  useEffect(() => {
    setMode(getStorageMode());
  }, []);

  if (mode === null) return null;

  if (mode !== "cloud") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>데이터 공유</CardTitle>
        </CardHeader>
        <CardContent className="flex items-start gap-3 text-sm text-muted-foreground">
          <Cloud className="w-5 h-5 shrink-0 mt-0.5" />
          <p>
            데이터 공유는 <strong className="text-foreground">클라우드 저장</strong> 모드에서만
            사용할 수 있습니다. 위 저장소 설정에서 클라우드 모드로 전환하세요.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <MySharesCard />
      <ReceivedSharesCard />
    </div>
  );
}
