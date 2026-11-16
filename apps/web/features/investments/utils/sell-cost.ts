import type { InvestmentItem } from "../types/types";
import type { SecurityType } from "./krx-tick-size";

/**
 * 증권거래세율 (%) — 2026-01-01 부터 코스피 0.05% + 농어촌특별세 0.15%, 코스닥 0.20% 로 둘 다
 * 0.20%. ETF·ETN 은 증권거래세가 없다. 세율이 바뀌면 이 값을 고친다.
 */
export const SECURITIES_TRANSACTION_TAX_PERCENT = 0.2;

/** 계좌에 매도 제비용률을 정하지 않았을 때 쓰는 증권사 매매 수수료율 (%) — 흔한 온라인 수수료. */
export const DEFAULT_COMMISSION_PERCENT = 0.015;

const TAX_EXEMPT_SECURITY_TYPES = new Set(["etf", "etn"]);

export type SellCost =
  /** 계좌에 직접 정한 제비용률 하나로 계산 (세금·수수료 포함). */
  | { kind: "manual"; percent: number; total: number }
  /** 종목 종류에 따른 증권거래세 + 기본 수수료. */
  | {
      kind: "auto";
      taxPercent: number;
      tax: number;
      commissionPercent: number;
      commission: number;
      total: number;
    };

/** 원 미만은 버린다 — 증권사도 세금·수수료의 원 미만을 절사한다. */
function costAt(proceeds: number, percent: number): number {
  return Math.floor((proceeds * percent) / 100);
}

/** 이 종목을 팔 때의 증권거래세율 (%). 종류를 모르면 주식으로 본다. */
export function transactionTaxPercent(securityType: SecurityType): number {
  return securityType && TAX_EXEMPT_SECURITY_TYPES.has(securityType)
    ? 0
    : SECURITIES_TRANSACTION_TAX_PERCENT;
}

/**
 * 매도 대금에서 빠지는 세금·수수료 (원).
 *
 * - 계좌에 매도 제비용률(`sellCostPercent`)을 정해 두었으면 그 비율 하나로 계산한다.
 * - 정하지 않았으면 (0) 자동으로 계산한다: 증권거래세 (주식 0.20%, ETF·ETN 0%) + 기본 수수료
 *   0.015%. 세금과 수수료는 각각 원 미만을 버린다.
 */
export function sellCostOf(
  account: Pick<InvestmentItem, "sellCostPercent">,
  proceeds: number,
  securityType: SecurityType
): SellCost {
  const amount = Math.max(0, proceeds);
  const manual = account.sellCostPercent ?? 0;
  if (manual > 0) {
    return { kind: "manual", percent: manual, total: costAt(amount, manual) };
  }
  const taxPercent = transactionTaxPercent(securityType);
  const tax = costAt(amount, taxPercent);
  const commission = costAt(amount, DEFAULT_COMMISSION_PERCENT);
  return {
    kind: "auto",
    taxPercent,
    tax,
    commissionPercent: DEFAULT_COMMISSION_PERCENT,
    commission,
    total: tax + commission,
  };
}
