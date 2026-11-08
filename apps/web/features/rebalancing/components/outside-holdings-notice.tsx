import { Callout } from "@web/seed-design/ui/callout";
import { formatWithCommas } from "@web/utils/number-format";
import type { OutsideHolding } from "../utils/holdings-outside-portfolio";

/**
 * 계좌에 있지만 포트폴리오 목표에 없는 종목 안내.
 * - `blocking`: 리밸런싱을 시작할 수 없다고 알린다 (시작 화면).
 * - 아니면: 계산에서 제외하고 있다고 알린다 (이미 진행 중인 리밸런싱).
 */
export function OutsideHoldingsNotice({
  holdings,
  blocking,
}: {
  holdings: OutsideHolding[];
  blocking: boolean;
}) {
  if (holdings.length === 0) return null;
  const list = holdings.map((h) => `${h.name} ${formatWithCommas(h.quantity)}주`).join(", ");
  return (
    <Callout
      tone={blocking ? "critical" : "warning"}
      title={
        blocking
          ? "포트폴리오에 없는 종목이 있어 리밸런싱을 시작할 수 없어요"
          : "포트폴리오에 없는 종목은 리밸런싱에서 제외하고 계산해요"
      }
      description={
        blocking
          ? `${list}. 포트폴리오에 종목을 추가하거나 계좌에서 정리한 뒤 시작해 주세요.`
          : `${list}. 이 종목의 금액은 목표 비중 계산에 넣지 않아요.`
      }
    />
  );
}
