import type { InvestmentItem } from "../types/types";
import type { SecurityType } from "./krx-tick-size";

/**
 * 계좌에 수수료율을 정하지 않았을 때 쓰는 증권사 매매 수수료율 (%) — 흔한 온라인 수수료
 * (유관기관 제비용 포함). 우대를 받는 계좌는 계좌 설정에서 실제 수수료율을 넣는다.
 */
export const DEFAULT_COMMISSION_PERCENT = 0.015;

/*
 * 참고 — 우대 수수료는 보통 유관기관 제비용(거래소·예탁원)만 받는 요율이라 상품마다 다르다:
 * 주식 0.0036396%, ETF·ETN·ELW 0.0042087% (2025-03-04~, KRX 기준). 그래서 계좌에 주식과
 * ETF·ETN 수수료율을 따로 둔다.
 */

/**
 * 매도할 때의 세율 (%) — 2026-01-01 양도분부터 (증권거래세법 시행령 개정).
 * - 코스피: 증권거래세 0.05% + 농어촌특별세 0.15%
 * - 코스닥: 증권거래세 0.20% (농어촌특별세 없음)
 * - 코넥스: 증권거래세 0.10%
 * 세율이 바뀌면 이 값을 고친다.
 */
const KOSPI_TRANSACTION_TAX_PERCENT = 0.05;
const KOSPI_RURAL_TAX_PERCENT = 0.15;
const KOSDAQ_TRANSACTION_TAX_PERCENT = 0.2;
const KONEX_TRANSACTION_TAX_PERCENT = 0.1;

/** ETF·ETN — 매도해도 거래세·농특세가 없고, 수수료율도 주식과 따로 둔다. */
const ETF_LIKE_SECURITY_TYPES = new Set(["etf", "etn"]);
const isEtfLike = (securityType: SecurityType) =>
  Boolean(securityType && ETF_LIKE_SECURITY_TYPES.has(securityType));

export type TradeAction = "매수" | "매도";

export interface TradeTaxRates {
  /** 증권거래세율 (%) */
  transactionTaxPercent: number;
  /** 농어촌특별세율 (%) */
  ruralTaxPercent: number;
}

/** 거래 한 건에서 빠지는 비용 (원). 각 항목은 원 미만을 버린다. */
export interface TradeCost {
  commissionPercent: number;
  commission: number;
  transactionTaxPercent: number;
  transactionTax: number;
  ruralTaxPercent: number;
  ruralTax: number;
  total: number;
}

/** 원 미만은 버린다 — 증권사도 세금·수수료의 원 미만을 절사한다. */
function costAt(amount: number, percent: number): number {
  return Math.floor((amount * percent) / 100);
}

export type CommissionRates = Pick<
  InvestmentItem,
  "stockCommissionPercent" | "etfCommissionPercent"
>;

const rateOrNull = (percent: number | null | undefined) =>
  typeof percent === "number" && Number.isFinite(percent) && percent >= 0 ? percent : null;

/**
 * 이 계좌에서 이 종목을 매매할 때의 수수료율 (%). ETF·ETN 은 ETF 수수료율, 정하지 않았으면
 * 주식 수수료율을 쓴다. 주식 수수료율도 없으면 기본값.
 */
export function commissionPercentOf(account: CommissionRates, securityType: SecurityType): number {
  const stock = rateOrNull(account.stockCommissionPercent) ?? DEFAULT_COMMISSION_PERCENT;
  return isEtfLike(securityType) ? (rateOrNull(account.etfCommissionPercent) ?? stock) : stock;
}

const NO_TAX: TradeTaxRates = { transactionTaxPercent: 0, ruralTaxPercent: 0 };

/**
 * 이 종목을 팔 때의 세율. ETF·ETN 과 해외 시장은 0. 시장을 모르면 (레거시 보유 종목) 코스닥과
 * 같은 0.20% 로 본다 — 코스피·코스닥 주식은 합계가 0.20% 다.
 */
export function sellTaxRates(market: string, securityType: SecurityType): TradeTaxRates {
  if (isEtfLike(securityType)) return NO_TAX;
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

/**
 * 매매 한 건의 비용 (원).
 *
 * - 수수료: 매수·매도 모두, 계좌의 상품별 수수료율 (`commissionPercentOf`) 로. 우대로 계좌마다,
 *   주식과 ETF·ETN 마다 다르다.
 * - 세금: 매도만. 시장·종목 종류로 정해지고 (`sellTaxRates`) 수수료 우대와 상관없다.
 */
export function tradeCostOf(
  account: CommissionRates,
  trade: { action: TradeAction; market: string; securityType: SecurityType },
  amount: number
): TradeCost {
  const value = Math.max(0, amount);
  const commissionPercent = commissionPercentOf(account, trade.securityType);
  const { transactionTaxPercent, ruralTaxPercent } =
    trade.action === "매도" ? sellTaxRates(trade.market, trade.securityType) : NO_TAX;
  const commission = costAt(value, commissionPercent);
  const transactionTax = costAt(value, transactionTaxPercent);
  const ruralTax = costAt(value, ruralTaxPercent);
  return {
    commissionPercent,
    commission,
    transactionTaxPercent,
    transactionTax,
    ruralTaxPercent,
    ruralTax,
    total: commission + transactionTax + ruralTax,
  };
}
