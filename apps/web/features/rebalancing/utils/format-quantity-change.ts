import { formatWithCommas } from "@web/utils/number-format";

/** 보유 수량 변화 표시: 매수 "+5,766", 매도 "−5" (유니코드 마이너스), 변화 없으면 빈 문자열. */
export function formatQuantityChange(change: number): string {
  if (change > 0) return `+${formatWithCommas(change)}`;
  if (change < 0) return `−${formatWithCommas(-change)}`;
  return "";
}
