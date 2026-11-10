"use client";

import { useState } from "react";
import { ConfirmDialog } from "@web/components/mobile/confirm-dialog";
import { sanitizePercentDraft } from "@web/components/mobile/input-format";
import { ACCOUNT_COLORS } from "@web/features/investments/types/constants";
import { DRIFT_MODE_LABELS } from "@web/features/portfolio/types/constants";
import type { DriftMode, PortfolioItem } from "@web/features/portfolio/types/types";
import { cn } from "@web/lib/utils";
import { ActionButton } from "@web/seed-design/ui/action-button";
import {
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetFooter,
  BottomSheetRoot,
} from "@web/seed-design/ui/bottom-sheet";
import { SegmentedControl, SegmentedControlItem } from "@web/seed-design/ui/segmented-control";
import { TextField, TextFieldInput } from "@web/seed-design/ui/text-field";
import { parseNumericString } from "@web/utils/number-format";
import { DriftRuleExample } from "./portfolio-drift-card";

/*
 * 편집 시트들은 열릴 때마다 현재 값으로 폼을 초기화해야 한다.
 * 호출측이 `key` 로 리마운트시키는 방식을 쓴다 (계좌 상세 시트와 동일).
 */

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 이격률 계산 방식과 경고 임계 (%) 를 고치는 시트. */
export function EditDriftThresholdSheet({
  open,
  onOpenChange,
  mode,
  value,
  exampleTarget,
  onSave,
}: SheetProps & {
  mode: DriftMode;
  value: number;
  /** 예시 범위에 쓸 목표 비중 (%). */
  exampleTarget: number;
  onSave: (mode: DriftMode, value: number) => void;
}) {
  const [modeDraft, setModeDraft] = useState(mode);
  const [draft, setDraft] = useState(String(value));
  const parsed = parseNumericString(draft);
  const parsedDraft = Number.isFinite(parsed) ? parsed : 0;
  return (
    <BottomSheetRoot open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent title="이격 경고" showHandle>
        {/* 키보드가 올라오면 시트가 키보드 위 공간에 들어가야 한다 (iOS 는 하단 안전 영역도 남는다).
            라벨 없이 간격을 줄여 한 화면에 들어가게 한다 — 무엇을 입력하는지는 제목과 예시가 말해 준다. */}
        <BottomSheetBody>
          <div className="pb-x3">
            <SegmentedControl
              aria-label="이격률 계산 방식"
              value={modeDraft}
              onValueChange={(next) => setModeDraft(next as DriftMode)}
            >
              {(Object.keys(DRIFT_MODE_LABELS) as DriftMode[]).map((m) => (
                <SegmentedControlItem key={m} value={m}>
                  {DRIFT_MODE_LABELS[m]}
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
          </div>
          {/* 방식과 임계값을 바꿀 때마다 실제 범위가 어떻게 되는지 입력 전에 바로 보여준다. */}
          <div className="bg-bg-neutral-weak rounded-r3 mb-x3 px-x4 py-x3" aria-live="polite">
            <DriftRuleExample
              rule={{ driftMode: modeDraft, driftThresholdPercent: parsedDraft }}
              targetPercent={exampleTarget}
              highlight
              className="t5-bold"
            />
          </div>
          <TextField
            value={draft}
            onValueChange={({ value: next }) => setDraft(sanitizePercentDraft(next))}
            suffix={modeDraft === "absolute" ? "%p" : "%"}
          >
            <TextFieldInput aria-label="이격률 경고 임계" inputMode="decimal" autoFocus />
          </TextField>
        </BottomSheetBody>
        <BottomSheetFooter>
          <ActionButton
            size="large"
            className="w-full"
            onClick={() => {
              onSave(modeDraft, parsedDraft);
              onOpenChange(false);
            }}
          >
            저장
          </ActionButton>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheetRoot>
  );
}

/** 포트폴리오 이름 / 색상 / 삭제. */
export function PortfolioSettingsSheet({
  open,
  onOpenChange,
  portfolio,
  onRename,
  onColorChange,
  onDelete,
}: SheetProps & {
  portfolio: PortfolioItem;
  onRename: (name: string) => void;
  onColorChange: (color: string) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(portfolio.name);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <BottomSheetRoot open={open} onOpenChange={onOpenChange}>
        <BottomSheetContent title="포트폴리오 수정" showHandle>
          <BottomSheetBody>
            <div className="flex flex-col gap-x5">
              <TextField
                label="포트폴리오 이름"
                value={name}
                onValueChange={({ value }) => setName(value)}
              >
                <TextFieldInput placeholder="포트폴리오 이름" />
              </TextField>
              <div>
                <p className="t4-medium text-fg-neutral mb-x2">색상</p>
                <div className="flex flex-wrap gap-x2">
                  {ACCOUNT_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`색상 ${color}`}
                      aria-pressed={portfolio.color === color}
                      onClick={() => onColorChange(color)}
                      className={cn(
                        "size-x8 rounded-full border-2",
                        portfolio.color === color
                          ? "border-stroke-neutral-contrast"
                          : "border-transparent"
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </BottomSheetBody>
          <BottomSheetFooter>
            <div className="flex w-full gap-x2">
              <ActionButton variant="neutralWeak" size="large" onClick={() => setConfirmOpen(true)}>
                삭제
              </ActionButton>
              <ActionButton
                size="large"
                flexGrow
                onClick={() => {
                  onRename(name);
                  onOpenChange(false);
                }}
              >
                저장
              </ActionButton>
            </div>
          </BottomSheetFooter>
        </BottomSheetContent>
      </BottomSheetRoot>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`"${portfolio.name}" 포트폴리오를 삭제할까요?`}
        description="목표 비중과 메모가 모두 삭제됩니다."
        onConfirm={() => {
          onDelete();
          onOpenChange(false);
        }}
      />
    </>
  );
}
