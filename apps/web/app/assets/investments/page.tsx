"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@web/components/ui/select";
import { ArcElement, Chart as ChartJS, Legend, Tooltip } from "chart.js";
import { Pie } from "react-chartjs-2";

// ChartJS registration
ChartJS.register(ArcElement, Tooltip, Legend);

export default function InvestmentsPage() {
  const [investments, setInvestments] = useState([
    {
      id: 1,
      accountName: "투자 계좌 #1", // 기본 계좌 이름으로 설정
      accountType: "",
      accountOwner: "본인",
      currency: "KRW",
      currentValue: "",
      note: "",
    },
  ]);

  // 현재 열려있는 계좌 폼 ID 추적
  const [expandedFormId, setExpandedFormId] = useState<number>(1);

  // 계좌 이름 수정 상태 관리
  const [editingNameId, setEditingNameId] = useState<number | null>(null);
  const [tempAccountName, setTempAccountName] = useState<string>("");

  // 사용자 정의 소유자 추가 기능
  const [customOwners, setCustomOwners] = useState<string[]>([]);
  const [newCustomOwner, setNewCustomOwner] = useState("");
  const [showCustomOwnerInput, setShowCustomOwnerInput] = useState(false);

  const addInvestmentItem = () => {
    const newId = investments.length > 0 ? Math.max(...investments.map((item) => item.id)) + 1 : 1;
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
  };

  const removeInvestmentItem = (id: number) => {
    setInvestments(investments.filter((item) => item.id !== id));
  };

  const handleChange = (id: number, field: string, value: string) => {
    // 필드를 수정하면 자동으로 해당 폼을 펼침
    if (expandedFormId !== id) {
      setExpandedFormId(id);
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

  const addCustomOwner = () => {
    if (newCustomOwner.trim() !== "" && !customOwners.includes(newCustomOwner.trim())) {
      setCustomOwners([...customOwners, newCustomOwner.trim()]);
      setNewCustomOwner("");
      setShowCustomOwnerInput(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Submitted investments data:", investments);
    // Here you would save the data to your backend
  };

  // 계좌 유형
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

  // 숫자를 한글로 변환하는 함수 (만원, 억원, 조원 단위 표시)
  const numberToKorean = (num: string): string => {
    if (!num || isNaN(Number(num))) return "";

    const number = Number(num);
    if (number === 0) return "0만원";

    // 조 단위 (1조 = 100,000억 = 1,000,000만)
    if (number >= 1000000) {
      const jo = Math.floor(number / 1000000); // 조 단위
      const remainder = number % 1000000; // 조 단위 이하

      if (remainder === 0) {
        return `${jo}조원`;
      }

      // 억 단위 처리
      const eok = Math.floor(remainder / 10000); // 억 단위
      const man = remainder % 10000; // 만 단위

      if (eok === 0) {
        return `${jo}조${man}만원`;
      } else if (man === 0) {
        return `${jo}조${eok}억원`;
      } else {
        return `${jo}조${eok}억${man}만원`;
      }
    }
    // 억 단위 (1억 = 10,000만)
    else if (number >= 10000) {
      const eok = Math.floor(number / 10000); // 억 단위
      const man = number % 10000; // 만 단위

      if (man === 0) {
        return `${eok}억원`;
      } else {
        return `${eok}억${man}만원`;
      }
    }
    // 만 단위만 있는 경우
    else {
      return `${number}만원`;
    }
  };

  console.log("investments data:", investments);

  return (
    <main className="flex flex-col items-center min-h-screen p-8 md:p-24">
      <div className="w-full max-w-4xl">
        <div className="mb-8">
          <Link
            href="/assets"
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
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
              <path d="m15 18-6-6 6-6" />
            </svg>
            돌아가기
          </Link>
        </div>

        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-4">투자 계좌 정보 입력</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            투자 계좌의 기본 정보와 평가금액을 입력해주세요
          </p>

          {investments.length > 0 && investments.some((item) => item.currentValue) && (
            <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm mb-6">
              <h2 className="text-lg font-medium mb-4">투자 계좌 요약</h2>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="relative" style={{ height: "250px" }}>
                  <Pie
                    data={{
                      // labels: investments
                      //   .filter(item => item.currentValue)
                      //                              .sort((a, b) =>
                      //         parseFloat(b.currentValue.replace(/,/g, "")) -
                      //         parseFloat(a.currentValue.replace(/,/g, ""))).map(item => item.accountName),
                      datasets: [
                        {
                          data: investments
                            .filter((item) => item.currentValue)
                            .sort(
                              (a, b) =>
                                parseFloat(b.currentValue.replace(/,/g, "")) -
                                parseFloat(a.currentValue.replace(/,/g, ""))
                            )
                            .map((item) => parseFloat(item.currentValue.replace(/,/g, ""))),
                          backgroundColor: [
                            "rgba(54, 162, 235, 0.8)",
                            "rgba(255, 99, 132, 0.8)",
                            "rgba(255, 206, 86, 0.8)",
                            "rgba(75, 192, 192, 0.8)",
                            "rgba(153, 102, 255, 0.8)",
                            "rgba(255, 159, 64, 0.8)",
                            "rgba(199, 199, 199, 0.8)",
                            "rgba(83, 102, 255, 0.8)",
                            "rgba(40, 159, 64, 0.8)",
                            "rgba(210, 199, 199, 0.8)",
                          ],
                          borderColor: [
                            "rgba(54, 162, 235, 1)",
                            "rgba(255, 99, 132, 1)",
                            "rgba(255, 206, 86, 1)",
                            "rgba(75, 192, 192, 1)",
                            "rgba(153, 102, 255, 1)",
                            "rgba(255, 159, 64, 1)",
                            "rgba(199, 199, 199, 1)",
                            "rgba(83, 102, 255, 1)",
                            "rgba(40, 159, 64, 1)",
                            "rgba(210, 199, 199, 1)",
                          ],
                          borderWidth: 1,
                        },
                      ],
                    }}
                    options={{
                      maintainAspectRatio: false,
                      plugins: {
                        tooltip: {
                          callbacks: {
                            label: function (context) {
                              const label = context.label || "";
                              const value = Number(context.raw);
                              const formattedValue =
                                value >= 10000
                                  ? numberToKorean(value.toString())
                                  : `${value.toLocaleString()} 만원`;
                              return `${label}: ${formattedValue}`;
                            },
                          },
                        },
                        legend: {
                          position: "right",
                          labels: {
                            boxWidth: 15,
                            padding: 15,
                          },
                        },
                      },
                    }}
                  />
                </div>

                <div className="space-y-3 self-center">
                  {investments
                    .filter((item) => item.currentValue)
                    .sort(
                      (a, b) =>
                        parseFloat(b.currentValue.replace(/,/g, "")) -
                        parseFloat(a.currentValue.replace(/,/g, ""))
                    )
                    .map((item, idx) => (
                      <div
                        key={`summary-${item.id}`}
                        className="flex justify-between items-center p-2 rounded-lg"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{
                              backgroundColor: [
                                "rgba(54, 162, 235, 0.8)",
                                "rgba(255, 99, 132, 0.8)",
                                "rgba(255, 206, 86, 0.8)",
                                "rgba(75, 192, 192, 0.8)",
                                "rgba(153, 102, 255, 0.8)",
                                "rgba(255, 159, 64, 0.8)",
                                "rgba(199, 199, 199, 0.8)",
                                "rgba(83, 102, 255, 0.8)",
                                "rgba(40, 159, 64, 0.8)",
                                "rgba(210, 199, 199, 0.8)",
                              ][idx % 10],
                            }}
                          />
                          <span className="font-medium">{item.accountName}</span>
                        </div>
                        <div className="text-right">
                          {item.currency === "KRW"
                            ? parseInt(item.currentValue.replace(/,/g, "")) >= 10000
                              ? numberToKorean(item.currentValue.replace(/,/g, ""))
                              : `${item.currentValue} 만원`
                            : `$ ${item.currentValue}`}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
        </div>

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
                    <div className="flex items-center gap-2">
                      {editingNameId === item.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={tempAccountName}
                            onChange={(e) => setTempAccountName(e.target.value)}
                            className="p-1 border border-gray-300 dark:border-gray-600 rounded text-base"
                            autoFocus
                            onBlur={saveAccountName}
                            onKeyDown={(e) => e.key === "Enter" && saveAccountName()}
                          />
                          <button
                            type="button"
                            onClick={saveAccountName}
                            className="text-blue-500 hover:text-blue-700"
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
                            className="text-red-500 hover:text-red-700"
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
                      ) : (
                        <div className="flex flex-col">
                          <h3 className="text-lg font-medium flex items-center gap-2">
                            {item.accountName}
                            <button
                              type="button"
                              onClick={() => startEditingName(item.id)}
                              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                              title="계좌 이름 수정"
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
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                          </h3>
                          {!isExpanded && (
                            <div className="flex flex-col gap-0.5">
                              {item.accountType && (
                                <div className="text-sm text-gray-600 dark:text-gray-400">
                                  {item.accountType} · {item.accountOwner}
                                </div>
                              )}
                              {item.currentValue && (
                                <div className="text-sm font-medium text-green-600 dark:text-green-500">
                                  {item.currency === "KRW"
                                    ? parseInt(item.currentValue.replace(/,/g, "")) >= 10000
                                      ? numberToKorean(item.currentValue.replace(/,/g, ""))
                                      : `${item.currentValue} 만원`
                                    : `$ ${item.currentValue}`}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {investments.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeInvestmentItem(item.id)}
                        className="text-red-500 hover:text-red-700 dark:hover:text-red-400 ml-4"
                      >
                        삭제
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="p-6 pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          계좌 유형
                        </label>
                        <Select
                          value={item.accountType}
                          onValueChange={(value) => handleChange(item.id, "accountType", value)}
                        >
                          <SelectTrigger>
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

                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          계좌 소유자
                        </label>
                        <div className="flex gap-2">
                          <div className="flex-grow">
                            <Select
                              value={item.accountOwner}
                              onValueChange={(value) =>
                                handleChange(item.id, "accountOwner", value)
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="계좌 소유자 선택" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  {accountOwners.map((owner) => (
                                    <SelectItem key={owner} value={owner}>
                                      {owner}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowCustomOwnerInput(true)}
                            className="px-3 py-2 bg-gray-200 dark:bg-gray-600 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500"
                            title="소유자 추가하기"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          통화
                        </label>
                        <Select
                          value={item.currency}
                          onValueChange={(value) => handleChange(item.id, "currency", value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {currencyOptions.map((currency) => (
                                <SelectItem key={currency} value={currency}>
                                  {currency === "KRW" ? "원화 (KRW)" : "달러 (USD)"}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          현재 평가금액 {item.currency === "KRW" ? "(만원)" : "(달러)"}
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={item.currentValue}
                            onChange={(e) => {
                              // Allow only numbers and commas
                              const value = e.target.value.replace(/[^0-9.,]/g, "");
                              handleChange(item.id, "currentValue", value);
                            }}
                            onBlur={(e) => {
                              if (e.target.value) {
                                try {
                                  // Parse the number and format it with commas
                                  const num = parseFloat(e.target.value.replace(/,/g, ""));
                                  if (!isNaN(num)) {
                                    handleChange(item.id, "currentValue", num.toLocaleString());
                                  }
                                } catch {
                                  // Keep the original value if parsing fails
                                }
                              }
                            }}
                            placeholder={
                              item.currency === "KRW" ? "현재 가치 (만원)" : "현재 가치 (달러)"
                            }
                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                          />
                          <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-gray-400">
                            {item.currency === "KRW" ? "만원" : "$"}
                          </div>
                        </div>
                        {item.currentValue && item.currency === "KRW" && (
                          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 pl-1">
                            <span
                              title={`${parseInt(item.currentValue.replace(/,/g, "")) * 10000}원`}
                            >
                              {numberToKorean(item.currentValue.replace(/,/g, ""))}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2 md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          메모
                        </label>
                        <textarea
                          value={item.note}
                          onChange={(e) => handleChange(item.id, "note", e.target.value)}
                          placeholder="추가 정보"
                          className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                          rows={2}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div className="mb-8">
            <button
              type="button"
              onClick={addInvestmentItem}
              className="w-full p-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
            >
              + 투자 계좌 추가하기
            </button>
          </div>

          <div className="flex justify-end gap-4">
            <Link
              href="/assets"
              className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              취소
            </Link>
            <button
              type="submit"
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              저장하기
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
