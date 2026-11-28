import type { LinkedPortfolioStatus } from "./linked-portfolio-status";

export interface PortfolioDriftSummary {
  /** 이격 기준을 넘은 계좌 수. */
  breachedCount: number;
  /** 기준 이내인 계좌 수. 판단할 수 없는 계좌(보유·시세 없음)는 어느 쪽에도 세지 않는다. */
  okCount: number;
}

/** 포트폴리오에 연결된 계좌들의 이격 상태를 한 줄 요약용으로 센다. */
export function summarizePortfolioDrift(
  statuses: (LinkedPortfolioStatus | null)[]
): PortfolioDriftSummary {
  let breachedCount = 0;
  let okCount = 0;
  for (const status of statuses) {
    if (status?.state === "needs-rebalancing") breachedCount++;
    if (status?.state === "ok") okCount++;
  }
  return { breachedCount, okCount };
}
