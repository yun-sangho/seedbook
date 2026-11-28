"use client";

import type React from "react";
import { TextField, TextFieldInput } from "@mobile/seed-design/ui/text-field";
import { formatMoneyDraft, moneyDraftReading } from "./input-format";

interface MoneyFieldProps {
  /**
   * 화면에 보이는 라벨. 시트 제목이 이미 같은 말을 하고 있으면 생략하고
   * `ariaLabel` 로 스크린리더용 이름만 준다.
   */
  label?: string;
  ariaLabel?: string;
  /** 쉼표 포함 표시 문자열. `parseNumericString` 으로 원 단위 숫자를 얻는다. */
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  errorMessage?: string;
  readOnly?: boolean;
  autoFocus?: boolean;
  /** 값이 있을 때 만원 단위 읽기 옆에 "초기화" 버튼을 보여준다. */
  clearable?: boolean;
  /** 만원 단위 읽기 뒤에 " · " 로 이어 붙일 설명들. 읽기와 같은 줄에 둬서 설명이 여러 줄로 늘지 않게 한다. */
  hints?: React.ReactNode[];
}

/**
 * 원 단위 금액 입력. 숫자 키패드를 띄우고, 1만원 이상이면 아래에 만원 단위 읽기를 보여준다.
 */
export function MoneyField({
  label,
  ariaLabel,
  value,
  onValueChange,
  placeholder = "0",
  errorMessage,
  readOnly,
  autoFocus,
  clearable = false,
  hints = [],
}: MoneyFieldProps) {
  const reading = moneyDraftReading(value);
  const showClear = clearable && !readOnly && value !== "";
  return (
    <TextField
      label={label}
      value={value}
      onValueChange={({ value: next }) => onValueChange(formatMoneyDraft(next))}
      suffix="원"
      description={
        <DescriptionLine
          items={[
            reading,
            ...hints,
            showClear && (
              // 버튼은 기본 스타일에서 글꼴을 물려받아 설명 글자와 같은 크기로 보인다.
              <button
                type="button"
                className="text-fg-neutral-muted underline underline-offset-2"
                onClick={() => onValueChange("")}
              >
                초기화
              </button>
            ),
          ]}
        />
      }
      invalid={!!errorMessage}
      errorMessage={errorMessage}
      readOnly={readOnly}
    >
      <TextFieldInput
        inputMode="numeric"
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label={label ? undefined : (ariaLabel ?? "금액")}
      />
    </TextField>
  );
}

/** 비어 있지 않은 항목만 " · " 로 잇는다. 모두 비면 설명을 두지 않는다. */
function DescriptionLine({ items }: { items: React.ReactNode[] }) {
  const shown = items.filter((item) => item !== undefined && item !== null && item !== false);
  if (shown.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-x1">
      {shown.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 항목 순서가 고정된 짧은 목록이다.
        <span key={i} className="flex items-center gap-x-x1">
          {i > 0 && <span aria-hidden>·</span>}
          {item}
        </span>
      ))}
    </span>
  );
}
