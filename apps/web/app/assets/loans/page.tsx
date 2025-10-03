"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@web/components/ui/select";
import { SortableItem } from "@web/components/ui/sortable-item";
import { SortableList } from "@web/components/ui/sortable-list";
import { Textarea } from "@web/components/ui/textarea";
import { useLoansStore } from "@web/features/loans/stores/loans-store";
import { DEFAULT_OWNERS, LOAN_TYPES } from "@web/features/loans/types/constants";
import { numberToKorean, parseNumericString } from "@web/utils/number-format";
import { ChevronLeft, Trash2 } from "lucide-react";

export default function LoansPage() {
  // Zustand 스토어에서 상태와 액션 가져오기
  const loans = useLoansStore((state) => state.loans);
  const addLoan = useLoansStore((state) => state.addLoan);
  const removeLoan = useLoansStore((state) => state.removeLoan);
  const updateLoan = useLoansStore((state) => state.updateLoan);
  const reorderLoans = useLoansStore((state) => state.reorderLoans);

  // 총 대출 금액 계산 - 최적화를 위해 useMemo 사용
  const totalLoansAmount = useMemo(() => {
    return loans.reduce((sum, item) => sum + item.amount, 0);
  }, [loans]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Zustand 스토어는 실시간으로 업데이트되므로 추가 저장 필요 없음
    console.log("대출 데이터가 저장되었습니다:", loans);
    // 자산 페이지로 이동
    window.location.href = "/assets";
  };

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
          <p className="text-gray-600 dark:text-gray-400 mb-2">
            주택담보대출, 신용대출 등의 대출 정보를 입력해주세요
          </p>
          <p className="text-red-600 dark:text-red-400">
            총 대출 금액: {numberToKorean(totalLoansAmount.toString())}원
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <SortableList
            items={loans}
            onReorder={reorderLoans}
            getItemId={(item) => item.id}
            renderDragOverlay={(activeId) => {
              const item = loans.find((loan) => loan.id === activeId);
              return item ? (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6 shadow-lg opacity-90">
                  <h3 className="text-lg font-semibold">{item.loanName}</h3>
                </div>
              ) : null;
            }}
          >
            {loans.map((item) => (
              <SortableItem key={item.id} id={item.id}>
                <div className="p-6 bg-gray-50 dark:bg-gray-800 rounded-xl">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">{item.loanName}</h3>
                    {loans.length > 1 && (
                      <button
                        type="button"
                        className="p-2 text-red-500 hover:bg-gray-100 rounded-full dark:hover:bg-gray-700"
                        onClick={() => removeLoan(item.id)}
                        aria-label="삭제"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor={`type-${item.id}`}>대출 유형</Label>
                      <Select
                        value={item.loanType}
                        onValueChange={(value) => updateLoan(item.id, "loanType", value)}
                      >
                        <SelectTrigger id={`type-${item.id}`}>
                          <SelectValue placeholder="대출 유형 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {LOAN_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor={`name-${item.id}`}>대출명</Label>
                      <Input
                        id={`name-${item.id}`}
                        placeholder="대출명"
                        value={item.loanName}
                        onChange={(e) => updateLoan(item.id, "loanName", e.target.value)}
                      />
                    </div>

                    <div>
                      <Label htmlFor={`owner-${item.id}`}>차주</Label>
                      <Select
                        value={item.loanOwner}
                        onValueChange={(value) => updateLoan(item.id, "loanOwner", value)}
                      >
                        <SelectTrigger id={`owner-${item.id}`}>
                          <SelectValue placeholder="차주 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {DEFAULT_OWNERS.map((owner) => (
                            <SelectItem key={owner} value={owner}>
                              {owner}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor={`lender-${item.id}`}>대출기관</Label>
                      <Input
                        id={`lender-${item.id}`}
                        placeholder="대출기관"
                        value={item.lender}
                        onChange={(e) => updateLoan(item.id, "lender", e.target.value)}
                      />
                    </div>

                    <div>
                      <Label htmlFor={`amount-${item.id}`}>대출 금액 (원)</Label>
                      <Input
                        id={`amount-${item.id}`}
                        placeholder="대출 금액"
                        value={item.amount === 0 ? "" : item.amount.toString()}
                        onChange={(e) =>
                          updateLoan(item.id, "amount", parseNumericString(e.target.value))
                        }
                      />
                    </div>

                    <div>
                      <Label htmlFor={`interestRate-${item.id}`}>이자율 (%)</Label>
                      <Input
                        id={`interestRate-${item.id}`}
                        placeholder="이자율"
                        value={item.interestRate === 0 ? "" : item.interestRate.toString()}
                        onChange={(e) =>
                          updateLoan(item.id, "interestRate", parseFloat(e.target.value))
                        }
                      />
                    </div>

                    <div>
                      <Label htmlFor={`maturityDate-${item.id}`}>만기일</Label>
                      <Input
                        id={`maturityDate-${item.id}`}
                        type="date"
                        value={item.maturityDate}
                        onChange={(e) => updateLoan(item.id, "maturityDate", e.target.value)}
                      />
                    </div>

                    <div>
                      <Label htmlFor={`monthlyPayment-${item.id}`}>월 상환금 (원)</Label>
                      <Input
                        id={`monthlyPayment-${item.id}`}
                        placeholder="월 상환금"
                        value={item.monthlyPayment === 0 ? "" : item.monthlyPayment.toString()}
                        onChange={(e) =>
                          updateLoan(item.id, "monthlyPayment", parseNumericString(e.target.value))
                        }
                      />
                    </div>

                    <div className="md:col-span-2">
                      <Label htmlFor={`note-${item.id}`}>메모</Label>
                      <Textarea
                        id={`note-${item.id}`}
                        placeholder="메모 추가"
                        value={item.note}
                        onChange={(e) => updateLoan(item.id, "note", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </SortableItem>
            ))}
          </SortableList>

          <button
            type="button"
            className="flex items-center justify-center w-full p-3 border border-dashed border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800/50"
            onClick={addLoan}
          >
            + 대출 추가
          </button>

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
