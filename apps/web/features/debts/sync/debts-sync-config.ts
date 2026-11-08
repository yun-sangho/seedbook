import type { ManagedStoreConfig } from "@web/lib/sync/managed-store-config";
import type { DebtsItem } from "../types/types";

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const text = (value: unknown) => (typeof value === "string" ? value : "");

/**
 * 부채 store (`debts-storage`) 의 엔티티 동기화 설정. store 를 import 하지 않는다 —
 * hybrid-storage 가 store 보다 먼저 이 설정을 읽는다.
 */
export const debtsSyncConfig: ManagedStoreConfig<DebtsItem> = {
  storageKey: "debts-storage",
  entity: "debt",
  listOrderDomain: "debts",
  metaKey: "seedbook.sync.debt",
  persistVersion: 3,
  itemsField: "debts",
  // 서버 검증(parseDebtFields)은 유한한 숫자만 받는다 — 입력 도중의 NaN 은 0 으로 보낸다.
  toData: (item) => ({
    loanName: text(item.loanName),
    loanType: text(item.loanType),
    lender: text(item.lender),
    amount: num(item.amount),
    interestRate: num(item.interestRate),
    maturityDate: text(item.maturityDate),
    monthlyPayment: num(item.monthlyPayment),
    note: text(item.note),
  }),
  fromData: (id, data) => ({
    id,
    loanName: text(data.loanName),
    loanType: text(data.loanType),
    lender: text(data.lender),
    amount: num(data.amount),
    interestRate: num(data.interestRate),
    maturityDate: text(data.maturityDate),
    monthlyPayment: num(data.monthlyPayment),
    note: text(data.note),
  }),
};
