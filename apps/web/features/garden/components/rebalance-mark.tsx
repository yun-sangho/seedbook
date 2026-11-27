import { REBALANCE_BADGE_COLOR } from "../plant-3d/plant-options";

/** 리밸런싱이 필요한 식물 표시 — 정원의 `!` 배지와 같은 모양 (작은 원형 !). */
export function RebalanceMark({ size = 18 }: { size?: number }) {
  return (
    <span
      role="img"
      aria-label="리밸런싱 필요"
      className="inline-flex shrink-0 items-center justify-center rounded-full border-[1.5px] border-white font-bold leading-none text-white"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.62),
        backgroundColor: REBALANCE_BADGE_COLOR,
      }}
    >
      !
    </span>
  );
}
