/**
 * 정원 홈 바텀시트가 멈출 높이 고르기. 높이(px)는 시트가 화면에 보이는 높이, `snaps` 는 오름차순.
 */

/** 이보다 빠르게 놓으면(px/ms) 가까운 높이 대신 그 방향의 다음 높이로 간다. */
export const SHEET_FLICK_VELOCITY = 0.5;

/** 끄는 동안의 높이를 가장 낮은·높은 멈춤 높이 사이로 묶는다. */
export function clampSheetHeight(height: number, snaps: readonly number[]): number {
  const low = snaps[0] ?? 0;
  const high = snaps[snaps.length - 1] ?? low;
  return Math.min(high, Math.max(low, height));
}

/**
 * 손을 뗀 뒤 멈출 높이. `velocity` 는 px/ms, 양수면 위로(커지는 쪽). 빠르게 튕기면 그 방향의 다음
 * 높이, 아니면 가장 가까운 높이.
 */
export function sheetSnap(height: number, velocity: number, snaps: readonly number[]): number {
  if (velocity >= SHEET_FLICK_VELOCITY) {
    return snaps.find((snap) => snap > height + 1) ?? snaps[snaps.length - 1] ?? height;
  }
  if (velocity <= -SHEET_FLICK_VELOCITY) {
    return [...snaps].reverse().find((snap) => snap < height - 1) ?? snaps[0] ?? height;
  }
  let nearest = snaps[0] ?? height;
  for (const snap of snaps) {
    if (Math.abs(snap - height) < Math.abs(nearest - height)) nearest = snap;
  }
  return nearest;
}
