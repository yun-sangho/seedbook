"use client";

import { TextField, TextFieldInput } from "@web/seed-design/ui/text-field";
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
        showClear ? (
          <span className="flex items-center gap-x2">
            {reading}
            {/* 버튼은 기본 스타일에서 글꼴을 물려받아 설명 글자와 같은 크기로 보인다. */}
            <button
              type="button"
              className="text-fg-neutral-muted underline underline-offset-2"
              onClick={() => onValueChange("")}
            >
              초기화
            </button>
          </span>
        ) : (
          reading
        )
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
