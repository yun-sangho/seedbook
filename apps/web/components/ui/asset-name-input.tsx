"use client";

import { useState } from "react";
import { Input } from "@web/components/ui/input";
import { Check, Edit, X } from "lucide-react";
import { Button } from "./button";
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
  inputClassName = "text-md font-bold text-gray-900 dark:text-white",
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
            className={`flex-1 ${inputClassName}`}
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
            <Button
              type="button"
              variant={"ghost"}
              onClick={saveValue}
              className="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/20  "
              aria-label="저장"
              size={"icon"}
            >
              <Check />
            </Button>
            <Button
              type="button"
              variant={"ghost"}
              onClick={cancelEditing}
              className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
              aria-label="취소"
              size={"icon"}
            >
              <X />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center" onClick={startEditing}>
          <span className={inputClassName}>{value}</span>
          <Button variant={"ghost"} type="button" aria-label="이름 수정" size={"icon"}>
            <Edit />
          </Button>
        </div>
      )}
    </div>
  );
}
