/** 기기 저장소 테스트용 store envelope (`{ state, version }`) — 지금 화면 store 의 모양. */

export const ACCOUNT_A = "11111111-1111-4111-8111-111111111111";
export const ACCOUNT_B = "22222222-2222-4222-8222-222222222222";
export const HOLDING_A = "33333333-3333-4333-8333-333333333333";
export const HOLDING_B = "33333333-3333-4333-8333-33333333333b";
export const CASH_A = "44444444-4444-4444-8444-444444444444";
export const PORTFOLIO = "55555555-5555-4555-8555-555555555555";
export const ALLOCATION = "66666666-6666-4666-8666-666666666666";
export const SESSION = "77777777-7777-4777-8777-777777777777";

export function envelope(state: Record<string, unknown>, version: number): string {
  return JSON.stringify({ state, version });
}

export function accountItem(id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    accountName: name,
    accountType: "일반 투자 계좌",
    currency: "KRW",
    initialInvestment: 1_000_000,
    currentValue: 1_200_000,
    note: "",
    color: "#ff0000",
    records: [] as unknown[],
    holdings: [] as unknown[],
    cashItems: [] as unknown[],
    ...extra,
  };
}

export const holdingItem = (id: string, ticker: string, quantity = 10) => ({
  id,
  market: "KRX",
  ticker,
  name: `종목 ${ticker}`,
  currency: "KRW",
  quantity,
  memo: "",
});

export const investmentState = () => ({
  investments: [
    accountItem(ACCOUNT_A, "증권 계좌", {
      records: [
        { date: "2026-11-01", initialInvestment: 900_000, currentValue: 950_000 },
        { date: "2026-10-01", initialInvestment: 800_000, currentValue: 820_000 },
      ],
      holdings: [holdingItem(HOLDING_A, "005930"), holdingItem(HOLDING_B, "000660", 2.5)],
      cashItems: [{ id: CASH_A, label: "예수금", amount: 50_000 }],
    }),
    accountItem(ACCOUNT_B, "연금 계좌"),
  ],
});

export const portfolioItem = (extra: Record<string, unknown> = {}) => ({
  id: PORTFOLIO,
  name: "안정형",
  color: "#00ff00",
  note: "",
  accountIds: [ACCOUNT_A],
  driftMode: "relative",
  driftThresholdPercent: 5,
  goalAmount: 10_000_000,
  growthStage: 1,
  goalHistory: [{ amount: 5_000_000, reachedAt: "2026-09-01T00:00:00.000Z" }],
  allocations: [
    {
      id: ALLOCATION,
      market: "KRX",
      ticker: "005930",
      name: "삼성전자",
      currency: "KRW",
      targetPercent: 60,
    },
  ],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  ...extra,
});

export const portfolioState = () => ({ portfolios: [portfolioItem()] });

export const taskItem = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  market: "KRX",
  ticker: "005930",
  name: "삼성전자",
  action: "매수",
  amount: 100_000,
  price: 50_000,
  quantity: 2,
  priceAsOf: "2026-11-01T06:30:00.000Z",
  priceKind: "close",
  executedQuantity: null,
  executedPrice: null,
  orderedQuantity: null,
  orderedPrice: null,
  filledQuantity: null,
  filledAmount: null,
  done: false,
  ...extra,
});

export const rebalancingState = () => ({
  sessions: [
    {
      id: SESSION,
      accountId: ACCOUNT_A,
      accountName: "증권 계좌",
      portfolioId: PORTFOLIO,
      portfolioName: "안정형",
      cashDelta: 10_000,
      tasks: [taskItem(ALLOCATION, { done: true, executedQuantity: 2 })],
      startedAt: "2026-11-01T00:00:00.000Z",
      completedAt: null,
      result: null,
    },
  ],
});

export const preferencesState = () => ({
  rebalancingTaskSort: "evalAsc",
  rebalancingCollapsedSections: ["filled"],
  accountSortOption: "evalAsc",
  portfolioStockSortOption: "nameAsc",
  holdingsSortOption: "nameAsc",
});
