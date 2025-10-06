"use client";

import { useState } from "react";
import { Button } from "@web/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@web/components/ui/dialog";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import type { AssetProgressPoint } from "@web/features/assets/types/progress";
import { numberToKorean } from "@web/utils/number-format";
import { Plus } from "lucide-react";

interface AddProgressPointDialogProps {
  currentTotals: {
    investments: number;
    savings: number;
    realAssets: number;
    loans: number;
  };
  onAdd: (point: AssetProgressPoint) => void;
}

export function AddProgressPointDialog({ currentTotals, onAdd }: AddProgressPointDialogProps) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => {
    // 오늘 날짜를 YYYY-MM-DD 형식으로
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [investments, setInvestments] = useState(currentTotals.investments.toString());
  const [savings, setSavings] = useState(currentTotals.savings.toString());
  const [realAssets, setRealAssets] = useState(currentTotals.realAssets.toString());
  const [loans, setLoans] = useState(currentTotals.loans.toString());

  // 폼 초기화
  const resetForm = () => {
    const today = new Date();
    setDate(today.toISOString().split("T")[0]);
    setInvestments(currentTotals.investments.toString());
    setSavings(currentTotals.savings.toString());
    setRealAssets(currentTotals.realAssets.toString());
    setLoans(currentTotals.loans.toString());
  };

  // Dialog 열릴 때 현재 총액으로 초기화
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      resetForm();
    }
    setOpen(newOpen);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!date) return;

    const investmentsNum = parseFloat(investments) || 0;
    const savingsNum = parseFloat(savings) || 0;
    const realAssetsNum = parseFloat(realAssets) || 0;
    const loansNum = parseFloat(loans) || 0;

    const totalAssets = investmentsNum + savingsNum + realAssetsNum;
    const netAssets = totalAssets - loansNum;

    const newPoint: AssetProgressPoint = {
      date,
      investments: investmentsNum,
      savings: savingsNum,
      realAssets: realAssetsNum,
      loans: loansNum,
      totalAssets,
      netAssets,
    };

    onAdd(newPoint);
    setOpen(false);
  };

  const totalAssets =
    (parseFloat(investments) || 0) + (parseFloat(savings) || 0) + (parseFloat(realAssets) || 0);
  const netAssets = totalAssets - (parseFloat(loans) || 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          자산 기록 추가
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>자산 기록 추가</DialogTitle>
            <DialogDescription>
              새로운 자산 기록을 추가합니다. 현재 총액이 자동으로 입력되어 있습니다.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* 날짜 입력 */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="date" className="text-right">
                날짜
              </Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="col-span-3"
                required
              />
            </div>

            {/* 투자 */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="investments" className="text-right">
                투자
              </Label>
              <div className="col-span-3 space-y-1">
                <Input
                  id="investments"
                  type="number"
                  step="0.01"
                  value={investments}
                  onChange={(e) => setInvestments(e.target.value)}
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground">
                  {numberToKorean(investments || "0")}
                </p>
              </div>
            </div>

            {/* 저축 */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="savings" className="text-right">
                저축
              </Label>
              <div className="col-span-3 space-y-1">
                <Input
                  id="savings"
                  type="number"
                  step="0.01"
                  value={savings}
                  onChange={(e) => setSavings(e.target.value)}
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground">{numberToKorean(savings || "0")}</p>
              </div>
            </div>

            {/* 실물자산 */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="realAssets" className="text-right">
                실물자산
              </Label>
              <div className="col-span-3 space-y-1">
                <Input
                  id="realAssets"
                  type="number"
                  step="0.01"
                  value={realAssets}
                  onChange={(e) => setRealAssets(e.target.value)}
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground">{numberToKorean(realAssets || "0")}</p>
              </div>
            </div>

            {/* 부채 */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="loans" className="text-right">
                부채
              </Label>
              <div className="col-span-3 space-y-1">
                <Input
                  id="loans"
                  type="number"
                  step="0.01"
                  value={loans}
                  onChange={(e) => setLoans(e.target.value)}
                  placeholder="0"
                />
                <p className="text-xs text-red-600">{numberToKorean(loans || "0")}</p>
              </div>
            </div>

            {/* 구분선 */}
            <div className="border-t my-2" />

            {/* 자산 총액 (계산된 값) */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right font-semibold">자산 총액</Label>
              <div className="col-span-3">
                <p className="text-lg font-semibold">{numberToKorean(totalAssets.toString())}</p>
              </div>
            </div>

            {/* 순자산 (계산된 값) */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right font-semibold">순자산</Label>
              <div className="col-span-3">
                <p className="text-lg font-semibold text-blue-600">
                  {numberToKorean(netAssets.toString())}
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button type="submit">추가</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
