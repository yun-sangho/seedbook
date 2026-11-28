import { MAX_TOTAL_PERCENT } from "../types/constants";
import type { PortfolioAllocation } from "../types/types";

export type AllocationValidationCode =
  | "OK"
  | "SUM_EXCEEDS_100"
  | "DUPLICATE_TICKER"
  | "NEGATIVE_PERCENT"
  | "MISSING_TICKER"
  | "UNDER_100";

export interface AllocationValidationResult {
  code: AllocationValidationCode;
  totalPercent: number;
  duplicates: string[]; // "MARKET:TICKER" 형태
  message: string;
}

const allocationKey = (a: Pick<PortfolioAllocation, "market" | "ticker">) =>
  `${a.market}:${a.ticker}`;

function findDuplicateKeys(allocations: PortfolioAllocation[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const a of allocations) {
    if (!a.market || !a.ticker) continue; // 미선택 항목은 중복 판정에서 제외
    const key = allocationKey(a);
    if (seen.has(key)) dupes.add(key);
    seen.add(key);
  }
  return Array.from(dupes);
}

const MESSAGES: Record<AllocationValidationCode, (ctx: { totalPercent: number }) => string> = {
  OK: () => "비중 합이 100% 입니다.",
  SUM_EXCEEDS_100: ({ totalPercent }) =>
    `합계가 ${totalPercent.toFixed(1)}% 입니다. ${MAX_TOTAL_PERCENT}% 이하로 맞춰주세요.`,
  DUPLICATE_TICKER: () => "같은 종목이 두 번 이상 추가되었습니다.",
  NEGATIVE_PERCENT: () => "비중은 0% 이상이어야 합니다.",
  MISSING_TICKER: () => "종목이 선택되지 않은 행이 있습니다.",
  UNDER_100: ({ totalPercent }) =>
    `미배정 ${(MAX_TOTAL_PERCENT - totalPercent).toFixed(1)}% 가 남아 있습니다.`,
};

/**
 * 포트폴리오 비중 합/중복/유효성 검사.
 *
 * 우선순위:
 *   1. SUM_EXCEEDS_100  (가장 시급한 사용자 조치)
 *   2. NEGATIVE_PERCENT
 *   3. MISSING_TICKER
 *   4. DUPLICATE_TICKER
 *   5. UNDER_100        (소프트 경고; 미배정 분은 현금 보유로 해석)
 *   6. OK
 */
export function validateAllocations(
  allocations: PortfolioAllocation[]
): AllocationValidationResult {
  const totalPercent = allocations.reduce((acc, a) => acc + (a.targetPercent || 0), 0);
  const duplicates = findDuplicateKeys(allocations);
  const hasNegative = allocations.some((a) => (a.targetPercent ?? 0) < 0);
  const hasMissing = allocations.some(
    (a) => (a.targetPercent ?? 0) > 0 && (!a.market || !a.ticker)
  );

  const buildResult = (code: AllocationValidationCode): AllocationValidationResult => ({
    code,
    totalPercent,
    duplicates,
    message: MESSAGES[code]({ totalPercent }),
  });

  if (totalPercent > MAX_TOTAL_PERCENT) return buildResult("SUM_EXCEEDS_100");
  if (hasNegative) return buildResult("NEGATIVE_PERCENT");
  if (hasMissing) return buildResult("MISSING_TICKER");
  if (duplicates.length > 0) return buildResult("DUPLICATE_TICKER");
  if (totalPercent < MAX_TOTAL_PERCENT && allocations.length > 0) return buildResult("UNDER_100");
  return buildResult("OK");
}
