"use client";

import type { RebalancingResult, RebalancingTask } from "@web/features/rebalancing/types/types";
import { formatQuantityChange } from "@web/features/rebalancing/utils/format-quantity-change";
import { executedPriceFor } from "@web/features/rebalancing/utils/rebalancing-session";
import { cn } from "@web/lib/utils";
import { formatWithCommas } from "@web/utils/number-format";

/** 목표 비중과 이 정도 차이까지는 맞춘 것으로 본다 (%p). */
const ON_TARGET_TOLERANCE_PERCENT = 1;

const formatPercent = (percent: number | null) =>
  percent === null ? "-" : `${percent.toFixed(1)}%`;

/**
 * 완료한 리밸런싱의 결과: 계좌에 반영한 뒤 포트폴리오 종목별 비중과 수량(이번 변화량).
 * 종목명이 잘리지 않도록 종목마다 두 줄로 보여준다 — 위: 이름 · 비중, 아래: 수량 · 체결 가격 ·
 * 목표 비중. 목표와 1%p 넘게 차이 나는 비중만 경고색으로 표시한다.
 * 예수금은 반영 전 → 후와 변화량을 보여준다 (반영 전 값이 없는 예전 기록은 후만).
 */
export function RebalancingResultSection({
  result,
  tasks,
}: {
  result: RebalancingResult;
  /** 체결 가격을 찾을 이 리밸런싱의 매매 목록. */
  tasks: RebalancingTask[];
}) {
  const cashBefore = result.cashBefore ?? null;
  const cashChange = cashBefore === null ? 0 : result.cash - cashBefore;
  return (
    <section className="px-x4 pb-x4">
      <h2 className="t5-bold pb-x1">리밸런싱 결과</h2>
      <ul className="divide-stroke-neutral-subtle divide-y">
        {result.holdings.map((h) => {
          const off =
            h.percent !== null &&
            Math.abs(h.percent - h.targetPercent) > ON_TARGET_TOLERANCE_PERCENT;
          // 이번에 사고판 종목만 체결 가격이 있다.
          const price = h.change !== 0 ? executedPriceFor(tasks, h.market, h.ticker) : null;
          return (
            <li key={`${h.market}:${h.ticker}`} className="py-x3">
              <div className="flex items-baseline gap-x3">
                <span className="t5-medium min-w-0 flex-1 break-keep">{h.name}</span>
                <span className={cn("t5-bold shrink-0 tabular-nums", off && "text-fg-warning")}>
                  {formatPercent(h.percent)}
                </span>
              </div>
              <div className="t4-regular text-fg-neutral-muted mt-x1 flex items-baseline gap-x3 tabular-nums">
                <span className="min-w-0 flex-1">
                  {formatWithCommas(h.quantity)}주
                  {h.change !== 0 && (
                    <span
                      className={cn(
                        "ml-x2 font-bold",
                        h.change > 0 ? "text-fg-positive" : "text-fg-critical"
                      )}
                    >
                      {formatQuantityChange(h.change)}
                    </span>
                  )}
                  {price !== null && <> · {formatWithCommas(price)}원</>}
                </span>
                <span className="shrink-0">목표 {formatPercent(h.targetPercent)}</span>
              </div>
            </li>
          );
        })}
        <li className="py-x3">
          <div className="flex items-baseline gap-x3">
            <span className="t5-medium min-w-0 flex-1">예수금</span>
            <span className="t5-bold shrink-0 tabular-nums">
              {formatPercent(result.cashPercent)}
            </span>
          </div>
          <div className="t4-regular text-fg-neutral-muted mt-x1 flex items-baseline gap-x3 tabular-nums">
            <span className="min-w-0 flex-1">
              {cashBefore !== null && <>{formatWithCommas(cashBefore)}원 → </>}
              <span className={cn(cashBefore !== null && "text-fg-neutral font-bold")}>
                {formatWithCommas(result.cash)}원
              </span>
            </span>
            {cashChange !== 0 && (
              <span
                className={cn(
                  "shrink-0 font-bold",
                  cashChange > 0 ? "text-fg-positive" : "text-fg-critical"
                )}
              >
                {cashChange > 0 ? "+" : "−"}
                {formatWithCommas(Math.abs(cashChange))}원
              </span>
            )}
          </div>
        </li>
      </ul>
    </section>
  );
}
