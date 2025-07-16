"use client";

import { useState } from "react";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@web/components/ui/select";
import { Textarea } from "@web/components/ui/textarea";
import { useSavingsStore } from "@web/features/savings/stores/savings-store";
import { DEFAULT_OWNERS, SAVINGS_TYPES } from "@web/features/savings/types/constants";
import { SavingsItem } from "@web/features/savings/types/types";
import { numberToKorean, parseNumericString } from "@web/utils/number-format";
import { Check, ChevronDown, Edit, Trash, X } from "lucide-react";

interface SavingsFormProps {
  handleSubmit: (e: React.FormEvent) => void;
}

export function SavingsForm({ handleSubmit }: SavingsFormProps) {
  // Zustand store에서 상태와 액션 가져오기
  const savings = useSavingsStore((state) => state.savings);
  const customOwners = useSavingsStore((state) => state.customOwners);
  const expandedFormId = useSavingsStore((state) => state.expandedFormId);
  const removeSavings = useSavingsStore((state) => state.removeSavings);
  const updateSavings = useSavingsStore((state) => state.updateSavings);
  const addCustomOwner = useSavingsStore((state) => state.addCustomOwner);
  const setExpandedFormId = useSavingsStore((state) => state.setExpandedFormId);

  // 계좌 이름 수정 상태 관리
  const [editingNameId, setEditingNameId] = useState<number | null>(null);
  const [tempAccountName, setTempAccountName] = useState<string>("");

  // 사용자 정의 소유자 추가 기능
  const [newCustomOwner, setNewCustomOwner] = useState("");
  const [showCustomOwnerInput, setShowCustomOwnerInput] = useState(false);

  // 계좌 삭제 함수
  const removeSavingsItem = (id: number) => {
    removeSavings(id);
  };

  // 필드 값 변경 함수
  const handleChange = (id: number, field: string, value: string) => {
    // 숫자 필드 처리
    if (field === "amount" && value) {
      try {
        // 콤마 제거 후 숫자로 변환
        const numericValue = parseNumericString(value);
        // 숫자가 아니면 처리하지 않음
        if (isNaN(numericValue)) return;

        // 숫자 값을 직접 업데이트
        updateSavings(id, field as keyof SavingsItem, numericValue);
        return;
      } catch (e) {
        // 숫자 변환 오류 시 그대로 사용
        console.error("Failed to format number", e);
      }
    }

    updateSavings(id, field as keyof SavingsItem, value);
  };

  // 계좌 이름 수정 시작
  const startEditingName = (id: number) => {
    const account = savings.find((item) => item.id === id);
    if (account) {
      setTempAccountName(account.accountName);
      setEditingNameId(id);
    }
  };

  // 계좌 이름 수정 저장
  const saveAccountName = () => {
    if (editingNameId !== null) {
      handleChange(editingNameId, "accountName", tempAccountName || `저축 계좌 #${editingNameId}`);
      setEditingNameId(null);
    }
  };

  // 계좌 이름 수정 취소
  const cancelEditingName = () => {
    setEditingNameId(null);
  };

  // 사용자 정의 소유자 추가
  const handleAddCustomOwner = () => {
    if (newCustomOwner.trim() !== "" && !customOwners.includes(newCustomOwner.trim())) {
      addCustomOwner(newCustomOwner.trim());
      setNewCustomOwner("");
      setShowCustomOwnerInput(false);
    }
  };

  // 계좌 소유자 옵션 (기본 + 사용자 추가)
  const accountOwners = [...DEFAULT_OWNERS, ...customOwners];

  return (
    <>
      {/* Custom Owner Input Modal */}
      {showCustomOwnerInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-md">
            <h3 className="text-lg font-medium mb-4">새 소유자 추가</h3>
            <div className="mb-4">
              <Label htmlFor="new-owner" className="mb-2">
                소유자 이름
              </Label>
              <Input
                id="new-owner"
                type="text"
                value={newCustomOwner}
                onChange={(e) => setNewCustomOwner(e.target.value)}
                placeholder="소유자 이름 입력"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCustomOwnerInput(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleAddCustomOwner}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                추가하기
              </button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {savings.map((item) => {
          const isExpanded = expandedFormId === item.id;

          return (
            <div key={item.id} className="mb-8 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
              <div
                className={`flex justify-between items-center p-6 ${!isExpanded ? "border-b-0" : "border-b dark:border-gray-700"} cursor-pointer`}
                onClick={(e) => {
                  // 이벤트 버블링을 방지하기 위해 특정 요소를 클릭했는지 확인
                  const target = e.target as HTMLElement;
                  const isEditButton = target.closest('[aria-label="이름 수정"]');
                  const isDeleteButton = target.closest('[aria-label="삭제"]');
                  const isCheckButton = target.closest('[aria-label="저장"]');
                  const isCancelButton = target.closest('[aria-label="취소"]');

                  // 특정 아이콘이나 버튼을 클릭한 경우 토글 동작을 방지
                  if (!isEditButton && !isDeleteButton && !isCheckButton && !isCancelButton) {
                    setExpandedFormId(isExpanded ? -1 : item.id);
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation(); // 이벤트 버블링 방지
                      setExpandedFormId(isExpanded ? -1 : item.id);
                    }}
                    className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                    aria-label={isExpanded ? "접기" : "펼치기"}
                  >
                    <ChevronDown
                      className={`transition-transform ${isExpanded ? "rotate-180" : ""} w-5 h-5`}
                    />
                  </button>

                  {editingNameId === item.id ? (
                    <div className="flex items-center">
                      <Input
                        type="text"
                        value={tempAccountName}
                        onChange={(e) => {
                          e.stopPropagation(); // 이벤트 버블링 방지
                          setTempAccountName(e.target.value);
                        }}
                        className="p-1 w-auto"
                        autoFocus
                        onBlur={(e) => {
                          e.stopPropagation(); // 이벤트 버블링 방지
                          saveAccountName();
                        }}
                        onClick={(e) => e.stopPropagation()} // 클릭 시 버블링 방지
                        onKeyDown={(e) => {
                          e.stopPropagation(); // 키 입력 시 버블링 방지
                          if (e.key === "Enter") {
                            e.preventDefault();
                            saveAccountName();
                          } else if (e.key === "Escape") {
                            cancelEditingName();
                          }
                        }}
                      />
                      <div className="flex ml-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation(); // 이벤트 버블링 방지
                            saveAccountName();
                          }}
                          className="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 mr-1"
                          aria-label="저장"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation(); // 이벤트 버블링 방지
                            cancelEditingName();
                          }}
                          className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                          aria-label="취소"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center">
                      <span className="font-medium">{item.accountName}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation(); // 이벤트 버블링 방지
                          startEditingName(item.id);
                        }}
                        className="ml-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                        aria-label="이름 수정"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center">
                  <div className="flex flex-col mr-4">
                    <div className="flex items-center">
                      <span className="text-sm font-bold">
                        {item.amount ? numberToKorean(item.amount.toString()) : "미입력"}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation(); // 이벤트 버블링 방지
                      removeSavingsItem(item.id);
                    }}
                    className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    aria-label="삭제"
                  >
                    <Trash className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* 저축 유형 */}
                    <div>
                      <Label htmlFor={`account-type-${item.id}`}>저축 유형</Label>
                      <div className="relative mt-2">
                        <Select
                          value={item.accountType}
                          onValueChange={(value) => handleChange(item.id, "accountType", value)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="저축 유형 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {SAVINGS_TYPES.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {type}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* 계좌 소유자 */}
                    <div>
                      <Label htmlFor={`account-owner-${item.id}`}>계좌 소유자</Label>
                      <div className="relative mt-2">
                        <Select
                          value={item.accountOwner}
                          onValueChange={(value) => {
                            if (value === "custom") {
                              setShowCustomOwnerInput(true);
                            } else {
                              handleChange(item.id, "accountOwner", value);
                            }
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="소유자 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {accountOwners.map((owner) => (
                                <SelectItem key={owner} value={owner}>
                                  {owner}
                                </SelectItem>
                              ))}
                              <SelectItem value="custom">+ 새 소유자 추가</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* 금액 */}
                    <div>
                      <Label htmlFor={`amount-${item.id}`}>금액 (만원)</Label>
                      <Input
                        id={`amount-${item.id}`}
                        type="text"
                        value={item.amount > 0 ? item.amount.toLocaleString() : ""}
                        onChange={(e) => handleChange(item.id, "amount", e.target.value)}
                        placeholder="만원 단위로 입력"
                        className="mt-2"
                      />
                    </div>

                    {/* 메모 */}
                    <div className="md:col-span-2">
                      <Label htmlFor={`note-${item.id}`}>메모</Label>
                      <Textarea
                        id={`note-${item.id}`}
                        value={item.note}
                        onChange={(e) => handleChange(item.id, "note", e.target.value)}
                        placeholder="메모 작성"
                        rows={3}
                        className="mt-2"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            저장하기
          </button>
        </div>
      </form>
    </>
  );
}
