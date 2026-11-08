"use client";

import { useRef } from "react";
import { Button } from "@web/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { useAllStoresHydrated } from "@web/lib/zustand-hydration";
import { Database, Download, Upload } from "lucide-react";
import { StorageModeCard } from "./_components/storage-mode-card";

export default function AdminPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 하이드레이션이 끝나기 전에 내보내기 버튼이 눌리면 빈 JSON 을 저장하게 되어
  // 사용자가 실제 데이터를 잃은 것처럼 오인할 수 있다. gate 가 통과된 이후에만
  // 버튼을 활성화한다.
  const storesHydrated = useAllStoresHydrated();

  const investments = useInvestmentStore((state) => state.investments);

  const exportData = () => {
    const data = {
      investments,
      exportedAt: new Date().toISOString(),
      version: "1.0",
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `seedbook-data-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const applyImportedData = (data: unknown): boolean => {
    if (!data || typeof data !== "object") {
      alert("올바른 Seedbook 데이터 파일이 아닙니다.");
      return false;
    }
    const envelope = data as Record<string, unknown>;
    if (!envelope.version || !envelope.exportedAt) {
      alert("올바른 Seedbook 데이터 파일이 아닙니다.");
      return false;
    }
    if (!confirm("기존 데이터를 모두 덮어씁니다. 계속하시겠습니까?")) {
      return false;
    }
    // 데이터 복원 - store 상태 직접 설정. ID 는 전부 문자열이라 별도의
    // auto-increment 카운터가 없어 그대로 주입하면 된다.
    if (Array.isArray(envelope.investments)) {
      useInvestmentStore.setState({ investments: envelope.investments });
    }
    alert("데이터가 성공적으로 복원되었습니다. 페이지를 새로고침해주세요.");
    return true;
  };

  const importData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        applyImportedData(JSON.parse(e.target?.result as string));
      } catch (error) {
        alert("데이터 파일을 읽는 중 오류가 발생했습니다.");
        console.error(error);
      }
    };
    reader.readAsText(file);

    // 파일 입력 초기화
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const loadDemoData = async () => {
    try {
      const res = await fetch("/seed-data/user-data.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      applyImportedData(await res.json());
    } catch (error) {
      alert("데모 데이터를 불러오는 중 오류가 발생했습니다.");
      console.error(error);
    }
  };

  return (
    <div className="w-full h-full max-w-4xl p-4 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">관리</h1>
      </div>

      {/* 저장소 설정 */}
      <StorageModeCard />

      {/* 데이터 요약 */}
      <Card>
        <CardHeader>
          <CardTitle>현재 데이터 상태</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{investments.length}</div>
            <div className="text-sm text-gray-600">투자 계좌</div>
          </div>
        </CardContent>
      </Card>

      {/* 데이터 관리 */}
      <Card>
        <CardHeader>
          <CardTitle>데이터 관리</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <Button
              onClick={exportData}
              disabled={!storesHydrated}
              className="flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              데이터 내보내기 (JSON)
            </Button>

            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={importData}
                className="hidden"
                id="import-file"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={!storesHydrated}
                className="flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                데이터 가져오기 (JSON)
              </Button>
            </div>

            <Button
              variant="secondary"
              onClick={loadDemoData}
              disabled={!storesHydrated}
              className="flex items-center gap-2"
            >
              <Database className="w-4 h-4" />
              데모 데이터 불러오기
            </Button>
          </div>

          <div className="text-sm text-gray-600 space-y-1">
            <p>• 데이터를 JSON 파일로 내보내거나 가져올 수 있습니다.</p>
            <p>• 가져온 데이터는 기존 데이터를 완전히 덮어씁니다.</p>
            <p>• 백업을 위해 정기적으로 데이터를 내보내는 것을 권장합니다.</p>
            <p>
              • &ldquo;데모 데이터 불러오기&rdquo; 는 번들된 샘플 데이터로 투자 계좌를 채웁니다.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
