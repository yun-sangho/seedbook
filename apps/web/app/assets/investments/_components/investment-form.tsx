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
import { formatWithCommas, parseNumericString } from "../_utils/number-format";

interface InvestmentItem {
  id: number;
  accountName: string;
  accountType: string;
  accountOwner: string;
  currency: string;
  currentValue: string;
  note: string;
}

interface InvestmentFormProps {
  investments: InvestmentItem[];
  setInvestments: React.Dispatch<React.SetStateAction<InvestmentItem[]>>;
  expandedFormId: number;
  setExpandedFormId: React.Dispatch<React.SetStateAction<number>>;
  customOwners: string[];
  setCustomOwners: React.Dispatch<React.SetStateAction<string[]>>;
  handleSubmit: (e: React.FormEvent) => void;
}

export function InvestmentForm({
  investments,
  setInvestments,
  expandedFormId,
  setExpandedFormId,
  customOwners,
  setCustomOwners,
  handleSubmit,
}: InvestmentFormProps) {
  // 계좌 이름 수정 상태 관리
  const [editingNameId, setEditingNameId] = useState<number | null>(null);
  const [tempAccountName, setTempAccountName] = useState<string>("");

  // 사용자 정의 소유자 추가 기능
  const [newCustomOwner, setNewCustomOwner] = useState("");
  const [showCustomOwnerInput, setShowCustomOwnerInput] = useState(false);

  // 계좌 삭제 함수
  const removeInvestmentItem = (id: number) => {
    setInvestments(investments.filter((item) => item.id !== id));
  };

  // 필드 값 변경 함수
  const handleChange = (id: number, field: string, value: string) => {
    // 필드를 수정하면 자동으로 해당 폼을 펼침
    if (expandedFormId !== id) {
      setExpandedFormId(id);
    }

    // 숫자 포맷팅 처리 (currentValue 필드의 경우)
    if (field === "currentValue" && value) {
      try {
        // 콤마 제거 후 숫자로 변환
        const numericValue = parseNumericString(value);
        // 숫자가 아니면 처리하지 않음
        if (isNaN(numericValue)) return;
        // 콤마 포맷팅 적용
        value = formatWithCommas(numericValue);
      } catch (e) {
        // 숫자 변환 오류 시 그대로 사용
        console.error("Failed to format number", e);
      }
    }

    setInvestments(
      investments.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
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
  const addCustomOwner = () => {
    if (newCustomOwner.trim() !== "" && !customOwners.includes(newCustomOwner.trim())) {
      setCustomOwners([...customOwners, newCustomOwner.trim()]);
      setNewCustomOwner("");
      setShowCustomOwnerInput(false);
    }
  };

  // 계좌 유형 목록
  const accountTypes = [
    "일반 투자 계좌",
    "해외 투자 계좌",
    "ISA 계좌",
    "IRP 계좌",
    "연금저축 계좌",
  ];

  // 계좌 소유자 옵션 (기본 + 사용자 추가)
  const accountOwners = ["본인", "배우자", ...customOwners];

  // 통화 옵션
  const currencyOptions = ["KRW", "USD"];

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
                onClick={addCustomOwner}
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
                className={`flex justify-between items-center p-6 ${!isExpanded ? "border-b-0" : "border-b dark:border-gray-700"}`}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setExpandedFormId(isExpanded ? -1 : item.id)}
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
                        onChange={(e) => setTempAccountName(e.target.value)}
                        className="p-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                        autoFocus
                        onBlur={saveAccountName}
                        onKeyDown={(e) => {
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
                          onClick={saveAccountName}
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
                          onClick={cancelEditingName}
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
                        onClick={() => startEditingName(item.id)}
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
                  <div className="flex items-center mr-4">
                    <span className="mr-2 text-sm font-medium">평가금액:</span>
                    <span className="text-sm font-bold">
                      {item.currentValue ? (
                        item.currency === "KRW" ? (
                          parseInt(item.currentValue.replace(/,/g, "")) >= 10000 ? (
                            <span className="text-blue-600 dark:text-blue-400">
                              {item.currentValue.replace(/,/g, "").length > 4
                                ? item.currentValue.replace(/,/g, "").slice(0, -4) +
                                  "억 " +
                                  (item.currentValue.replace(/,/g, "").slice(-4) !== "0000"
                                    ? item.currentValue.replace(/,/g, "").slice(-4) + "만"
                                    : "")
                                : item.currentValue + "만"}
                              원
                            </span>
                          ) : (
                            <span className="text-blue-600 dark:text-blue-400">
                              {item.currentValue}만원
                            </span>
                          )
                        ) : (
                          <span className="text-green-600 dark:text-green-400">
                            $ {item.currentValue}
                          </span>
                        )
                      ) : (
                        "미입력"
                      )}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeInvestmentItem(item.id)}
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
                              {accountTypes.map((type) => (
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
                              {currencyOptions.map((currency) => (
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
                        현재 평가 금액 ({item.currency === "KRW" ? "만원" : "달러"})
                      </label>
                      <input
                        type="text"
                        value={item.currentValue}
                        onChange={(e) => handleChange(item.id, "currentValue", e.target.value)}
                        placeholder={`${item.currency === "KRW" ? "만원" : "달러"} 단위로 입력`}
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

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => {
              const newId =
                investments.length > 0 ? Math.max(...investments.map((item) => item.id)) + 1 : 1;
              setInvestments([
                {
                  id: newId,
                  accountName: `투자 계좌 #${newId}`,
                  accountType: "",
                  accountOwner: "본인",
                  currency: "KRW",
                  currentValue: "",
                  note: "",
                },
                ...investments,
              ]);
              // 새 계좌 폼을 자동으로 펼침
              setExpandedFormId(newId);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + 투자 계좌 추가
          </button>

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
