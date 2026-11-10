import type { InvestmentItem } from "@web/features/investments/types/types";
import type { RebalancingSession, RebalancingTask } from "../types/types";
import { applyRebalancingToAccount } from "./apply-rebalancing-to-account";

/**
 * 계좌에 반영할 때와 같은 계산(`applyRebalancingToAccount`)으로, 예수금 항목의 잔액을 0 으로
 * 자르기 전 값을 구한다. 완료한 매매(기록한 체결 가격)와 시작할 때 넣은 현금 투입/인출이 들어간다.
 */
function rawCashAfter(
  account: InvestmentItem,
  session: RebalancingSession,
  tasks: RebalancingTask[]
): number {
  // 통화는 새 보유 종목을 만들 때만 쓰여 예수금 계산과 상관없다.
  const applied = applyRebalancingToAccount(account, { ...session, tasks }, () => "KRW");
  return applied.cash.before + applied.cashChange;
}

/**
 * 매매 하나를 이 수량·가격으로 기록하기 전/후의 예수금 (원). `after` 는 0 아래로 내려갈 수 있다 —
 * 마이너스면 기록을 막는다. `before` 에는 이 매매를 빼고 다른 완료한 매매만 넣는다 (이 매매를 이미
 * 기록했었다면 그 값도 뺀다). 아직 완료하지 않은 다른 매매는 넣지 않는다.
 */
export function tradeCashPreview(
  account: InvestmentItem,
  session: RebalancingSession,
  taskId: string,
  quantity: number,
  price: number
): { before: number; after: number } {
  const without = session.tasks.map((t) => (t.id === taskId ? { ...t, done: false } : t));
  const withTrade = session.tasks.map((t) =>
    t.id === taskId ? { ...t, done: true, executedQuantity: quantity, executedPrice: price } : t
  );
  return {
    before: rawCashAfter(account, session, without),
    after: rawCashAfter(account, session, withTrade),
  };
}
