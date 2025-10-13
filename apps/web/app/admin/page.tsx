"use client";

import { useRef } from "react";
import { Button } from "@web/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card";
import { useProgressStore } from "@web/features/assets/stores/progress-store";
import { useDebtsStore } from "@web/features/debts/stores/debts-store";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { useRealAssetsStore } from "@web/features/real-assets/stores/real-assets-store";
import { useSavingsStore } from "@web/features/savings/stores/savings-store";
import { Download, Upload } from "lucide-react";

export default function AdminPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const investments = useInvestmentStore((state) => state.investments);
  const savings = useSavingsStore((state) => state.savings);
  const realAssets = useRealAssetsStore((state) => state.realAssets);
  const debts = useDebtsStore((state) => state.debts);
  const progressPoints = useProgressStore((state) => state.progressPoints);

  const exportData = () => {
    const data = {
      investments,
      savings,
      realAssets,
      debts,
      progressPoints,
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

  const importData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);

        // 데이터 검증
        if (!data.version || !data.exportedAt) {
          alert("올바른 Seedbook 데이터 파일이 아닙니다.");
          return;
        }

        // 확인 대화상자
        if (!confirm("기존 데이터를 모두 덮어씁니다. 계속하시겠습니까?")) {
          return;
        }

        // 데이터 복원 - store 상태 직접 설정
        if (data.investments && Array.isArray(data.investments)) {
          const maxId =
            data.investments.length > 0
              ? Math.max(...data.investments.map((inv: { id: number }) => inv.id))
              : 0;
          useInvestmentStore.setState({
            investments: data.investments,
            lastInvestmentId: maxId + 1,
          });
        }
        if (data.savings && Array.isArray(data.savings)) {
          const maxId =
            data.savings.length > 0
              ? Math.max(...data.savings.map((sav: { id: number }) => sav.id))
              : 0;
          useSavingsStore.setState({
            savings: data.savings,
            lastSavingsId: maxId + 1,
          });
        }
        if (data.realAssets && Array.isArray(data.realAssets)) {
          const maxId =
            data.realAssets.length > 0
              ? Math.max(...data.realAssets.map((asset: { id: number }) => asset.id))
              : 0;
          useRealAssetsStore.setState({
            realAssets: data.realAssets,
            lastRealAssetId: maxId + 1,
          });
        }
        if (data.debts && Array.isArray(data.debts)) {
          const maxId =
            data.debts.length > 0
              ? Math.max(...data.debts.map((debt: { id: number }) => debt.id))
              : 0;
          useDebtsStore.setState({
            debts: data.debts,
            lastDebtId: maxId + 1,
          });
        }
        if (data.progressPoints && Array.isArray(data.progressPoints)) {
          useProgressStore.getState().setProgressPoints(data.progressPoints);
        }

        alert("데이터가 성공적으로 복원되었습니다. 페이지를 새로고침해주세요.");
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

  const getDataSummary = () => {
    return {
      investments: investments.length,
      savings: savings.length,
      realAssets: realAssets.length,
      loans: debts.length,
      progressPoints: progressPoints.length,
    };
  };

  const summary = getDataSummary();

  return (
    <div className="w-full h-full max-w-4xl p-4 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">관리</h1>
      </div>

      {/* 데이터 요약 */}
      <Card>
        <CardHeader>
          <CardTitle>현재 데이터 상태</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{summary.investments}</div>
              <div className="text-sm text-gray-600">투자</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{summary.savings}</div>
              <div className="text-sm text-gray-600">저축</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{summary.realAssets}</div>
              <div className="text-sm text-gray-600">실물자산</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{summary.loans}</div>
              <div className="text-sm text-gray-600">대출</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{summary.progressPoints}</div>
              <div className="text-sm text-gray-600">진행기록</div>
            </div>
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
            <Button onClick={exportData} className="flex items-center gap-2">
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
                className="flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                데이터 가져오기 (JSON)
              </Button>
            </div>
          </div>

          <div className="text-sm text-gray-600 space-y-1">
            <p>• 데이터를 JSON 파일로 내보내거나 가져올 수 있습니다.</p>
            <p>• 가져온 데이터는 기존 데이터를 완전히 덮어씁니다.</p>
            <p>• 백업을 위해 정기적으로 데이터를 내보내는 것을 권장합니다.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
