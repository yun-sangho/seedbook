/**
 * 행 변환(`*-record.ts`)이 읽는 DB 행의 모양. 서버 Postgres 테이블(`@seedbook/database` 의
 * `schema`)과 기기 SQLite 테이블(`apps/web/lib/native/device-db`)이 같은 모양이라, DB 를 import
 * 하지 않고 읽는 컬럼만 적는다. 서버는 drizzle 의 행(`$inferSelect`)을 그대로 넘기므로 컬럼 타입이
 * 어긋나면 서버 쪽 호출이 타입 오류가 난다.
 */

import type { PlantGoal } from "./portfolio-types";

/** `investment_account` */
export interface InvestmentAccountRow {
  accountName: string;
  accountType: string;
  currency: string;
  initialInvestment: bigint;
  currentValue: bigint;
  note: string;
  color: string;
  sellCostPercent: number;
}

/** `investment_record` */
export interface InvestmentRecordRow {
  date: Date;
  initialInvestment: bigint;
  currentValue: bigint;
}

/** `stock_holding` */
export interface StockHoldingRow {
  id: string;
  market: string;
  ticker: string;
  name: string;
  currency: string;
  quantity: number;
  memo: string;
}

/** `cash_item` */
export interface CashItemRow {
  id: string;
  label: string;
  amount: bigint;
}

/** `portfolio` */
export interface PortfolioRow {
  name: string;
  color: string;
  note: string;
  accountIds: string[];
  driftMode: "relative" | "absolute";
  driftThresholdPercent: number;
  goalAmount: number | null;
  growthStage: number;
  goalHistory: PlantGoal[];
  createdAt: Date;
  updatedAt: Date;
}

/** `portfolio_allocation` */
export interface PortfolioAllocationRow {
  id: string;
  market: string;
  ticker: string;
  name: string;
  currency: string;
  targetPercent: number;
}

/** `rebalancing` */
export interface RebalancingRow {
  id: string;
  accountId: string;
  accountName: string;
  portfolioId: string;
  portfolioName: string;
  cashDelta: bigint;
  tasks: unknown;
  startedAt: Date;
  completedAt: Date | null;
  result: unknown;
}
