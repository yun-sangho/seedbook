"use client";

import type { RebalancingResult } from "@web/features/rebalancing/types/types";
import { cn } from "@web/lib/utils";
import { formatWithCommas } from "@web/utils/number-format";

/** 목표 비중과 이 정도 차이까지는 맞춘 것으로 본다 (%p). */
const ON_TARGET_TOLERANCE_PERCENT = 1;

const formatPercent = (percent: number | null) =>
  percent === null ? "-" : `${percent.toFixed(1)}%`;

/**
 * 완료한 리밸런싱의 결과: 계좌에 반영한 뒤 포트폴리오 종목별 수량(이번 변화량)과
 * 비중 / 목표 비중. 목표와 1%p 넘게 차이 나는 비중만 경고색으로 표시한다.
 */
export function RebalancingResultSection({ result }: { result: RebalancingResult }) {
  return (
    <section className="px-x4 pb-x4">
      <div className="flex items-baseline justify-between pb-x2">
        <h2 className="t5-bold">리밸런싱 결과</h2>
        <span className="t2-regular text-fg-neutral-subtle">비중 / 목표</span>
      </div>
      <ul>
        {result.holdings.map((h) => {
          const off =
            h.percent !== null &&
            Math.abs(h.percent - h.targetPercent) > ON_TARGET_TOLERANCE_PERCENT;
          return (
            <li key={`${h.market}:${h.ticker}`} className="flex items-center gap-x3 py-x2">
              <span className="t4-regular min-w-0 flex-1 truncate">{h.name}</span>
              <span className="t4-regular shrink-0 tabular-nums">
                {formatWithCommas(h.quantity)}주
                {h.change !== 0 && (
                  <span
                    className={cn(
                      "t3-bold ml-x1",
                      h.change > 0 ? "text-fg-positive" : "text-fg-critical"
                    )}
                  >
                    {h.change > 0 ? "+" : "−"}
                    {formatWithCommas(Math.abs(h.change))}
                  </span>
                )}
              </span>
              <span className="t4-regular w-[104px] shrink-0 text-right tabular-nums">
                <span className={cn("font-bold", off && "text-fg-warning")}>
                  {formatPercent(h.percent)}
                </span>
                <span className="text-fg-neutral-subtle"> / {formatPercent(h.targetPercent)}</span>
              </span>
            </li>
          );
        })}
        <li className="flex items-center gap-x3 py-x2">
          <span className="t4-regular min-w-0 flex-1">예수금</span>
          <span className="t4-regular shrink-0 tabular-nums">
            {formatWithCommas(result.cash)}원
          </span>
          <span className="t4-regular w-[104px] shrink-0 text-right font-bold tabular-nums">
            {formatPercent(result.cashPercent)}
          </span>
        </li>
      </ul>
    </section>
  );
}
