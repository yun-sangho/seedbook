"use client";

import { useState } from "react";
import { ConfirmDialog } from "@web/components/mobile/confirm-dialog";
import { sanitizePercentDraft } from "@web/components/mobile/input-format";
import { ACCOUNT_COLORS } from "@web/features/investments/types/constants";
import type { PortfolioItem } from "@web/features/portfolio/types/types";
import { cn } from "@web/lib/utils";
import { ActionButton } from "@web/seed-design/ui/action-button";
import {
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetFooter,
  BottomSheetRoot,
} from "@web/seed-design/ui/bottom-sheet";
import { TextField, TextFieldInput } from "@web/seed-design/ui/text-field";
import { parseNumericString } from "@web/utils/number-format";

/*
 * 편집 시트들은 열릴 때마다 현재 값으로 폼을 초기화해야 한다.
 * 호출측이 `key` 로 리마운트시키는 방식을 쓴다 (계좌 상세 시트와 동일).
 */

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 이격률 경고 임계 (%) 를 고치는 시트. */
export function EditDriftThresholdSheet({
  open,
  onOpenChange,
  value,
  onSave,
}: SheetProps & { value: number; onSave: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  return (
    <BottomSheetRoot open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent
        title="이격 경고"
        description="목표 대비 차이가 이 값보다 크면 리밸런싱이 필요하다고 표시해요"
        showHandle
      >
        <BottomSheetBody>
          <TextField
            label="이격률 경고 임계"
            value={draft}
            onValueChange={({ value: next }) => setDraft(sanitizePercentDraft(next))}
            suffix="%"
          >
            <TextFieldInput inputMode="decimal" autoFocus />
          </TextField>
        </BottomSheetBody>
        <BottomSheetFooter>
          <ActionButton
            size="large"
            className="w-full"
            onClick={() => {
              const num = parseNumericString(draft);
              onSave(Number.isFinite(num) ? num : 0);
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
