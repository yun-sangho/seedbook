"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default function LoansPage() {
  const [loans, setLoans] = useState([
    {
      id: 1,
      type: "",
      institution: "",
      amount: "",
      interestRate: "",
      startDate: "",
      endDate: "",
      monthlyPayment: "",
      note: "",
    },
  ]);

  const addLoanItem = () => {
    const newId = loans.length > 0 ? Math.max(...loans.map((item) => item.id)) + 1 : 1;
    setLoans([
      ...loans,
      {
        id: newId,
        type: "",
        institution: "",
        amount: "",
        interestRate: "",
        startDate: "",
        endDate: "",
        monthlyPayment: "",
        note: "",
      },
    ]);
  };

  const removeLoanItem = (id: number) => {
    setLoans(loans.filter((item) => item.id !== id));
  };

  const handleChange = (id: number, field: string, value: string) => {
    setLoans(loans.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Submitted loans data:", loans);
    // Here you would save the data to your backend
  };

  const loanTypes = [
    "주택담보대출",
    "전세자금대출",
    "신용대출",
    "학자금대출",
    "자동차대출",
    "카드대출",
    "기타",
  ];

  return (
    <main className="flex flex-col items-center min-h-screen p-8 md:p-24">
      <div className="w-full max-w-4xl">
        <div className="mb-8">
          <Link
            href="/assets"
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
          >
            <ChevronLeft className="w-5 h-5" />
            돌아가기
          </Link>
        </div>

        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-4">대출 정보 입력</h1>
          <p className="text-gray-600 dark:text-gray-400">
            주택담보대출, 신용대출 등의 대출 정보를 입력해주세요
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {loans.map((item) => (
            <div key={item.id} className="mb-8 p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">대출 항목 #{item.id}</h3>
                {loans.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLoanItem(item.id)}
                    className="text-red-500 hover:text-red-700 dark:hover:text-red-400"
                  >
                    삭제
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    대출 종류
                  </label>
                  <select
                    value={item.type}
                    onChange={(e) => handleChange(item.id, "type", e.target.value)}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                    required
                  >
                    <option value="">대출 종류 선택</option>
                    {loanTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    금융 기관
                  </label>
                  <input
                    type="text"
                    value={item.institution}
                    onChange={(e) => handleChange(item.id, "institution", e.target.value)}
                    placeholder="은행 또는 금융기관"
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    대출 금액 (원)
                  </label>
                  <input
                    type="text"
                    value={item.amount}
                    onChange={(e) => handleChange(item.id, "amount", e.target.value)}
                    placeholder="원금"
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    이자율 (%)
                  </label>
                  <input
                    type="text"
                    value={item.interestRate}
                    onChange={(e) => handleChange(item.id, "interestRate", e.target.value)}
                    placeholder="연 이자율"
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    대출 시작일
                  </label>
                  <input
                    type="date"
                    value={item.startDate}
                    onChange={(e) => handleChange(item.id, "startDate", e.target.value)}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    만기일
                  </label>
                  <input
                    type="date"
                    value={item.endDate}
                    onChange={(e) => handleChange(item.id, "endDate", e.target.value)}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    월 상환액 (원)
                  </label>
                  <input
                    type="text"
                    value={item.monthlyPayment}
                    onChange={(e) => handleChange(item.id, "monthlyPayment", e.target.value)}
                    placeholder="월 납부액"
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                  />
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
          ))}

          <div className="mb-8">
            <button
              type="button"
              onClick={addLoanItem}
              className="w-full p-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
            >
              + 대출 항목 추가하기
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
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              저장하기
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
