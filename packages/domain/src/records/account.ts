import { defineRecord } from "../define-record";
import { f } from "../fields";

/**
 * 투자 계좌 (`investment_account`). `portfolioId` 가 계좌 ↔ 포트폴리오 연결의 원본이다 —
 * "한 계좌 = 한 포트폴리오" 가 필드 하나로 보장된다 (설계 §2.3).
 */
export const account = defineRecord({
  type: "account",
  table: "investment_account",
  key: { kind: "uuid" },
  sortable: true,
  fields: {
    accountName: f.text(),
    accountType: f.text(),
    currency: f.text(),
    initialInvestment: f.money({ normalize: ["finiteOrZero", "trunc"] }),
    currentValue: f.money({ normalize: ["finiteOrZero", "trunc"] }),
    note: f.text({ default: "" }),
    color: f.text(),
    portfolioId: f.uuidRef({ nullable: true, default: null }),
  },
});
