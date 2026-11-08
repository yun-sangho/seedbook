import type { schema } from "@seedbook/database";
import {
  bigIntToNumber,
  formatDate,
  parseDate,
  toBigInt,
} from "@web/app/api/storage/_translators/types";

/**
 * 부채 한 건의 클라이언트 표현 (`features/debts` 의 `DebtsItem` 과 같은 모양).
 * envelope translator 와 엔티티 동기화 API 가 같은 변환을 쓴다.
 */
export type DebtPayload = {
  id: string;
  loanName: string;
  loanType: string;
  lender: string;
  amount: number;
  interestRate: number;
  maturityDate: string; // "YYYY-MM-DD" 또는 "" (만기 없음)
  monthlyPayment: number;
  note: string;
};

type DebtRow = typeof schema.debt.$inferSelect;

/** DB 행 → 클라이언트 표현. */
export function debtRowToPayload(row: DebtRow): DebtPayload {
  return {
    id: row.id,
    loanName: row.loanName,
    loanType: row.loanType,
    lender: row.lender,
    amount: bigIntToNumber(row.amount),
    interestRate: row.interestRate,
    maturityDate: row.maturityDate ? formatDate(row.maturityDate) : "",
    monthlyPayment: bigIntToNumber(row.monthlyPayment),
    note: row.note,
  };
}

/** 클라이언트 표현 → 갱신 가능한 컬럼 값 (id / userId / 동기화 컬럼 제외). */
export function debtPayloadToColumns(payload: Omit<DebtPayload, "id">) {
  return {
    loanName: payload.loanName,
    loanType: payload.loanType,
    lender: payload.lender,
    amount: toBigInt(payload.amount),
    interestRate: payload.interestRate,
    maturityDate: payload.maturityDate ? parseDate(payload.maturityDate) : null,
    monthlyPayment: toBigInt(payload.monthlyPayment),
    note: payload.note,
  };
}

/**
 * 외부 입력을 부채 필드로 검증한다. 잘못된 모양이면 `null`.
 * 누락된 선택 필드(`maturityDate`, `note`)는 빈 문자열로 채운다.
 */
export function parseDebtFields(value: unknown): Omit<DebtPayload, "id"> | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const isText = (x: unknown): x is string => typeof x === "string";
  const isNumber = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
  const optionalText = (x: unknown) => (x === undefined || x === null ? "" : x);

  const maturityDate = optionalText(v.maturityDate);
  const note = optionalText(v.note);
  if (
    !isText(v.loanName) ||
    !isText(v.loanType) ||
    !isText(v.lender) ||
    !isNumber(v.amount) ||
    !isNumber(v.interestRate) ||
    !isNumber(v.monthlyPayment) ||
    !isText(maturityDate) ||
    !isText(note)
  ) {
    return null;
  }
  if (maturityDate !== "" && parseDate(maturityDate) === null) return null;

  return {
    loanName: v.loanName,
    loanType: v.loanType,
    lender: v.lender,
    amount: v.amount,
    interestRate: v.interestRate,
    maturityDate,
    monthlyPayment: v.monthlyPayment,
    note,
  };
}
