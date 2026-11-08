/** 기준 가격이 이만큼 이상 오래되면 배너로 경고한다. */
export const PRICE_AGE_WARNING_MS = 5 * 60 * 1000;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * 리밸런싱 권장 수량을 계산한 가격이 지금보다 5분 이상 오래됐으면 경고 문구, 아니면 null.
 */
export function priceAgeWarning(asOfIso: string, now: Date = new Date()): string | null {
  const asOf = Date.parse(asOfIso);
  if (Number.isNaN(asOf)) return null;
  const age = now.getTime() - asOf;
  if (age < PRICE_AGE_WARNING_MS) return null;
  return `지금보다 ${formatAge(age)} 전 가격이에요. 시세가 달라졌을 수 있어요.`;
}

/** 분 → 시간 → 일 단위로 내림. */
function formatAge(age: number): string {
  if (age >= DAY) return `${Math.floor(age / DAY)}일`;
  if (age >= HOUR) return `${Math.floor(age / HOUR)}시간`;
  return `${Math.floor(age / MINUTE)}분`;
}
