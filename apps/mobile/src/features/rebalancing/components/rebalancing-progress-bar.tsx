/** 할 일 진행 막대 + "완료/전체" 숫자. */
export function RebalancingProgressBar({ done, total }: { done: number; total: number }) {
  const percent = total > 0 ? (done / total) * 100 : 0;
  return (
    <div className="mt-x2 flex items-center gap-x2">
      <div
        className="bg-bg-neutral-weak h-[6px] flex-1 overflow-hidden rounded-full"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <div className="bg-bg-brand-solid h-full rounded-full" style={{ width: `${percent}%` }} />
      </div>
      <span className="t3-medium text-fg-neutral-muted shrink-0 tabular-nums">
        {done}/{total}
      </span>
    </div>
  );
}
