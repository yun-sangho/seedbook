"use client";

import { useState } from "react";
import { Input } from "@web/components/ui/input";
import { Check, Edit, X } from "lucide-react";
import { cn } from "./utils";

interface AssetNameInputProps {
  id: string | number;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  labelClassName?: string;
  inputClassName?: string;
}

export function AssetNameInput({
  id,
  value,
  onChange,
  placeholder,
  className = "",
  inputClassName = "text-xl font-bold text-gray-900 dark:text-white",
}: AssetNameInputProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState("");

  const startEditing = () => {
    setTempValue(value);
    setIsEditing(true);
  };

  const saveValue = () => {
    onChange(tempValue || `자산 #${id}`);
    setIsEditing(false);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setTempValue("");
  };

  return (
    <div className={cn(className)}>
      {isEditing ? (
        <div className="flex items-center">
          <Input
            type="text"
            value={tempValue}
            onChange={(e) => setTempValue(e.target.value)}
            className={`flex-1 text-lg font-semibold ${inputClassName}`}
            autoFocus
            onBlur={saveValue}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                saveValue();
              } else if (e.key === "Escape") {
                cancelEditing();
              }
            }}
            placeholder={placeholder}
          />
          <div className="flex ml-2">
            <button
              type="button"
              onClick={saveValue}
              className="p-1 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-md transition-colors"
              aria-label="저장"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={cancelEditing}
              className="p-1 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors ml-1"
              aria-label="취소"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center">
          <span className={inputClassName}>{value}</span>
          <button
            type="button"
            onClick={startEditing}
            className="ml-2 p-1 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
            aria-label="이름 수정"
          >
            <Edit className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
