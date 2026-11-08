import { ACCOUNT_COLORS, COLOR_FAMILIES } from "@web/features/investments/types/constants";
import { getNextColor } from "@web/utils/color-selection";

/**
 * Allocations 길이만큼 색상을 생성한다. `getNextColor` 를 누적 호출해
 * 인접한 종목이 다른 색상 계열에서 뽑히도록 한다.
 */
export function buildAllocationColors(count: number): string[] {
  const used: string[] = [];
  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    const c = getNextColor(used, ACCOUNT_COLORS, COLOR_FAMILIES);
    used.push(c);
    colors.push(c);
  }
  return colors;
}
