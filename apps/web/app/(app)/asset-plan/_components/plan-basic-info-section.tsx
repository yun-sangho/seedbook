"use client";

import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import { Calendar, Target } from "lucide-react";

interface PlanBasicInfoSectionProps {
  planName: string;
  planPeriod: string;
  setPlanName: (v: string) => void;
  setPlanPeriod: (v: string) => void;
}

export function PlanBasicInfoSection({
  planName,
  planPeriod,
  setPlanName,
  setPlanPeriod,
}: PlanBasicInfoSectionProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl">
      <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
        <Target className="w-5 h-5" />
        계획 기본 정보
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <Label htmlFor="planName">계획 이름</Label>
          <Input
            id="planName"
            value={planName}
            onChange={(e) => setPlanName(e.target.value)}
            placeholder="예: 은퇴 준비 계획"
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="planPeriod" className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            계획 기간 (년)
          </Label>
          <Input
            id="planPeriod"
            type="number"
            min="1"
            max="50"
            value={planPeriod}
            onChange={(e) => setPlanPeriod(e.target.value)}
            placeholder="30"
            className="mt-1"
          />
        </div>
      </div>
    </div>
  );
}
