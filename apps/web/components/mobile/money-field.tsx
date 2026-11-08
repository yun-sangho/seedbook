"use client";

import { TextField, TextFieldInput } from "@web/seed-design/ui/text-field";
import { numberToKorean, parseNumericString } from "@web/utils/number-format";
import { formatMoneyDraft } from "./input-format";

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
}

/**
 * 원 단위 금액 입력. 숫자 키패드를 띄우고, 아래에 만원 단위 읽기를 보여준다.
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
}: MoneyFieldProps) {
  const parsed = parseNumericString(value);
  return (
    <TextField
      label={label}
      value={value}
      onValueChange={({ value: next }) => onValueChange(formatMoneyDraft(next))}
      suffix="원"
      description={Number.isFinite(parsed) && parsed > 0 ? numberToKorean(parsed) : undefined}
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
