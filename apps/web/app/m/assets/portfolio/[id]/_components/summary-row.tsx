import type { ReactNode } from "react";

/**
 * 포트폴리오 상세 상단 요약 상자의 한 줄: 흐린 라벨로 시작하는 내용(최대 두 줄) + 오른쪽 버튼.
 */
export function SummaryRow({
  label,
  action,
  children,
}: {
  label: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-x12 items-center gap-x3 py-x2">
      <p className="t4-medium line-clamp-2 min-w-0 flex-1 tabular-nums">
        <span className="text-fg-neutral-subtle font-normal">{label} </span>
        {children}
      </p>
      {action}
    </div>
  );
}
