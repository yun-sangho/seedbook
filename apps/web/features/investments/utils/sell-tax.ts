import type { SecurityType } from "./krx-tick-size";

/**
 * 매도할 때의 세율 (%) — 2026-01-01 양도분부터 (증권거래세법 시행령 개정).
 * - 코스피: 증권거래세 0.05% + 농어촌특별세 0.15%
 * - 코스닥: 증권거래세 0.20% (농어촌특별세 없음)
 * - 코넥스: 증권거래세 0.10%
 * 세율이 바뀌면 이 값을 고친다.
 *
 * 증권사 수수료는 계좌마다 (우대 등) 달라 계산하지 않는다 — 리밸런싱을 시작할 때 거래 가능
 * 금액을 조금 줄여 감안한다.
 */
const KOSPI_TRANSACTION_TAX_PERCENT = 0.05;
const KOSPI_RURAL_TAX_PERCENT = 0.15;
const KOSDAQ_TRANSACTION_TAX_PERCENT = 0.2;
const KONEX_TRANSACTION_TAX_PERCENT = 0.1;

/** ETF·ETN — 매도해도 증권거래세·농어촌특별세가 없다. */
const TAX_FREE_SECURITY_TYPES = new Set(["etf", "etn"]);

export interface SellTaxRates {
  /** 증권거래세율 (%) */
  transactionTaxPercent: number;
  /** 농어촌특별세율 (%) */
  ruralTaxPercent: number;
}

/** 매도 한 건의 세금 (원). 각 항목은 원 미만을 버린다. */
export interface SellTax extends SellTaxRates {
  transactionTax: number;
  ruralTax: number;
  total: number;
}

const NO_TAX: SellTaxRates = { transactionTaxPercent: 0, ruralTaxPercent: 0 };

/**
 * 이 종목을 팔 때의 세율. ETF·ETN 과 해외 시장은 0. 시장을 모르면 (레거시 보유 종목) 코스닥과
 * 같은 0.20% 로 본다 — 코스피·코스닥 주식은 합계가 0.20% 다.
 */
export function sellTaxRates(market: string, securityType: SecurityType): SellTaxRates {
  if (securityType && TAX_FREE_SECURITY_TYPES.has(securityType)) return NO_TAX;
  switch (market) {
    case "KOSPI":
      return {
        transactionTaxPercent: KOSPI_TRANSACTION_TAX_PERCENT,
        ruralTaxPercent: KOSPI_RURAL_TAX_PERCENT,
      };
    case "KONEX":
      return { transactionTaxPercent: KONEX_TRANSACTION_TAX_PERCENT, ruralTaxPercent: 0 };
    case "KOSDAQ":
    case "":
      return { transactionTaxPercent: KOSDAQ_TRANSACTION_TAX_PERCENT, ruralTaxPercent: 0 };
    default:
      return NO_TAX;
  }
}

/** 원 미만은 버린다 — 증권사도 세금의 원 미만을 절사한다 (체결 건별). */
function taxAt(amount: number, percent: number): number {
  return Math.floor((amount * percent) / 100);
}

/** 매도 금액 `amount` (원) 에 붙는 세금. */
export function sellTaxOf(market: string, securityType: SecurityType, amount: number): SellTax {
  const value = Math.max(0, amount);
  const rates = sellTaxRates(market, securityType);
  const transactionTax = taxAt(value, rates.transactionTaxPercent);
  const ruralTax = taxAt(value, rates.ruralTaxPercent);
  return { ...rates, transactionTax, ruralTax, total: transactionTax + ruralTax };
}
