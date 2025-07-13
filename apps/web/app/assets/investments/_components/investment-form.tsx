"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@web/components/ui/select";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import {
  ACCOUNT_TYPES,
  CURRENCY_OPTIONS,
  CurrencyType,
  DEFAULT_OWNERS,
} from "@web/features/investments/types/constants";
import { InvestmentItem } from "@web/features/investments/types/types";
import {
  calculateReturnRate,
  formatReturnRate,
  numberToKorean,
  parseNumericString,
} from "@web/utils/number-format";

interface InvestmentFormProps {
  handleSubmit: (e: React.FormEvent) => void;
}

export function InvestmentForm({ handleSubmit }: InvestmentFormProps) {
  // Zustand store에서 상태와 액션 가져오기
  const investments = useInvestmentStore((state) => state.investments);
  const customOwners = useInvestmentStore((state) => state.customOwners);
  const expandedFormId = useInvestmentStore((state) => state.expandedFormId);
  const removeInvestment = useInvestmentStore((state) => state.removeInvestment);
  const updateInvestment = useInvestmentStore((state) => state.updateInvestment);
  const addCustomOwner = useInvestmentStore((state) => state.addCustomOwner);
  const setExpandedFormId = useInvestmentStore((state) => state.setExpandedFormId);
  // 계좌 이름 수정 상태 관리
  const [editingNameId, setEditingNameId] = useState<number | null>(null);
  const [tempAccountName, setTempAccountName] = useState<string>("");

  // 사용자 정의 소유자 추가 기능
  const [newCustomOwner, setNewCustomOwner] = useState("");
  const [showCustomOwnerInput, setShowCustomOwnerInput] = useState(false);

  // 계좌 삭제 함수
  const removeInvestmentItem = (id: number) => {
    removeInvestment(id);
  };

  // 필드 값 변경 함수
  const handleChange = (id: number, field: string, value: string) => {
    // 숫자 필드 처리 (currentValue 또는 initialInvestment 필드의 경우)
    if ((field === "currentValue" || field === "initialInvestment") && value) {
      try {
        // 콤마 제거 후 숫자로 변환
        const numericValue = parseNumericString(value);
        // 숫자가 아니면 처리하지 않음
        if (isNaN(numericValue)) return;

        // 숫자 값을 직접 업데이트
        updateInvestment(id, field as keyof InvestmentItem, numericValue);
        return;
      } catch (e) {
        // 숫자 변환 오류 시 그대로 사용
        console.error("Failed to format number", e);
      }
    }

    updateInvestment(id, field as keyof InvestmentItem, value);
  };

  // 계좌 이름 수정 시작
  const startEditingName = (id: number) => {
    const account = investments.find((item) => item.id === id);
    if (account) {
      setTempAccountName(account.accountName);
      setEditingNameId(id);
    }
  };

  // 계좌 이름 수정 저장
  const saveAccountName = () => {
    if (editingNameId !== null) {
      handleChange(editingNameId, "accountName", tempAccountName || `투자 계좌 #${editingNameId}`);
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
              <input
                type="text"
                value={newCustomOwner}
                onChange={(e) => setNewCustomOwner(e.target.value)}
                placeholder="소유자 이름 입력"
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
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
        {investments.map((item) => {
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
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>

                  {editingNameId === item.id ? (
                    <div className="flex items-center">
                      <input
                        type="text"
                        value={tempAccountName}
                        onChange={(e) => {
                          e.stopPropagation(); // 이벤트 버블링 방지
                          setTempAccountName(e.target.value);
                        }}
                        className="p-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
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
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
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
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M18 6 6 18" />
                            <path d="m6 6 12 12" />
                          </svg>
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
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center">
                  <div className="flex flex-col mr-4">
                    <div className="flex items-center">
                      <span className="text-sm font-bold">
                        {item.currentValue
                          ? numberToKorean(item.currentValue.toString())
                          : "미입력"}
                      </span>
                    </div>

                    {item.currentValue > 0 && (
                      <div className="flex items-center">
                        <span
                          className={`text-xs font-bold ${
                            calculateReturnRate(
                              item.currentValue,
                              item.initialInvestment || Math.round(item.currentValue * 0.5)
                            ) >= 0
                              ? "text-green-600 dark:text-green-400"
                              : "text-red-600 dark:text-red-400"
                          }`}
                        >
                          {formatReturnRate(
                            calculateReturnRate(
                              item.currentValue,
                              item.initialInvestment || Math.round(item.currentValue * 0.5)
                            )
                          )}
                        </span>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation(); // 이벤트 버블링 방지
                      removeInvestmentItem(item.id);
                    }}
                    className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    aria-label="삭제"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* 계좌 유형 */}
                    <div>
                      <label className="block mb-2 text-sm font-medium">계좌 유형</label>
                      <div className="relative">
                        <Select
                          value={item.accountType}
                          onValueChange={(value) => handleChange(item.id, "accountType", value)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="계좌 유형 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {ACCOUNT_TYPES.map((type) => (
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
                      <label className="block mb-2 text-sm font-medium">계좌 소유자</label>
                      <div className="relative">
                        <Select
                          value={item.accountOwner}
                          onValueChange={(value) => handleChange(item.id, "accountOwner", value)}
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
                              <button
                                type="button"
                                className="flex w-full items-center px-2 py-1.5 text-sm rounded-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-blue-600 dark:text-blue-400"
                                onClick={(e) => {
                                  e.preventDefault();
                                  setShowCustomOwnerInput(true);
                                }}
                              >
                                + 새 소유자 추가
                              </button>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* 통화 */}
                    <div>
                      <label className="block mb-2 text-sm font-medium">통화</label>
                      <div className="relative">
                        <Select
                          value={item.currency}
                          onValueChange={(value) => handleChange(item.id, "currency", value)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="통화 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {CURRENCY_OPTIONS.map((currency) => (
                                <SelectItem key={currency} value={currency}>
                                  {currency}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* 평가 금액 */}
                    <div>
                      <label className="block mb-2 text-sm font-medium">
                        현재 평가 금액 ({item.currency === CurrencyType.KRW ? "만원" : "달러"})
                      </label>
                      <input
                        type="text"
                        value={item.currentValue > 0 ? item.currentValue.toLocaleString() : ""}
                        onChange={(e) => handleChange(item.id, "currentValue", e.target.value)}
                        placeholder={`${item.currency === CurrencyType.KRW ? "만원" : "달러"} 단위로 입력`}
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                      />
                    </div>

                    {/* 투자 원금 */}
                    <div>
                      <label className="block mb-2 text-sm font-medium">
                        투자 원금 ({item.currency === CurrencyType.KRW ? "만원" : "달러"})
                      </label>
                      <input
                        type="text"
                        value={
                          item.initialInvestment ? item.initialInvestment.toLocaleString() : ""
                        }
                        onChange={(e) => handleChange(item.id, "initialInvestment", e.target.value)}
                        placeholder={
                          item.currentValue
                            ? `${Math.round(item.currentValue * 0.5).toLocaleString()} (평가금액의 50%)`
                            : `미입력시 평가금액의 50%`
                        }
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                      />
                    </div>

                    {/* 메모 */}
                    <div className="md:col-span-2">
                      <label className="block mb-2 text-sm font-medium">메모</label>
                      <textarea
                        value={item.note}
                        onChange={(e) => handleChange(item.id, "note", e.target.value)}
                        placeholder="메모 작성"
                        rows={3}
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
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
