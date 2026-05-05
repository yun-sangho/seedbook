"use client";

import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import { CurrencyType } from "@web/types/account.consts";
import { numberToKorean } from "@web/utils/number-format";
import { cn } from "./utils";

interface AssetValueInputProps {
  id: string | number;
  label?: string;
  value: number;
  currency: CurrencyType;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
}

export function AssetValueInput({
  id,
  label = "평가금액",
  value,
  currency,
  onChange,
  placeholder,
  className = "",
  readOnly = false,
}: AssetValueInputProps) {
  const currencyUnit = currency === CurrencyType.KRW ? "원" : "달러";
  const defaultPlaceholder = `${currencyUnit} 단위로 입력`;

  return (
    <div className={cn(className, "flex flex-col")}>
      <Label
        htmlFor={`asset-value-${id}`}
        className="text-gray-900 dark:text-white inline-flex items-center flex-wrap"
      >
        {label} ({currencyUnit})
        {value > 0 && (
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {numberToKorean(value.toString())}
          </span>
        )}
      </Label>
      <Input
        id={`asset-value-${id}`}
        type="text"
        value={value > 0 ? value.toLocaleString() : ""}
        onChange={readOnly ? undefined : (e) => onChange(e.target.value)}
        placeholder={placeholder || defaultPlaceholder}
        readOnly={readOnly}
        tabIndex={readOnly ? -1 : 0}
        className={`mt-2 text-xl font-bold text-blue-600 dark:text-blue-400 border-2 border-blue-200 dark:border-blue-800 focus:border-blue-500 dark:focus:border-blue-400 ${readOnly ? "bg-muted/30 cursor-default" : ""}`}
      />
    </div>
  );
}
