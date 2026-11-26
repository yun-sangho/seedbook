import { numberToKorean, parseNumericString } from "@web/utils/number-format";

/** 만원 단위 읽기는 1만원부터 의미가 있다 — 그보다 작으면 "0원" 이 되어 입력값과 어긋난다. */
const MIN_READABLE_WON = 10_000;

/** 숫자만 남기고 천 단위 쉼표를 붙인다 (원/주 정수 입력용). 빈 입력은 빈 문자열. */
export function formatMoneyDraft(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
  return digits === "" ? "" : Number(digits).toLocaleString();
}

/**
 * 숫자 키패드엔 마이너스 키가 없어 부호는 따로 고른다. 마이너스면 앞에 "-" 를 붙여
 * `parseNumericString` 이 0 아래 값으로 읽게 한다. 빈 입력은 그대로 빈 문자열.
 */
export function signMoneyDraft(draft: string, negative: boolean): string {
  return negative && draft !== "" ? `-${draft}` : draft;
}

/** 소수 허용 비중 입력 정리: 숫자와 첫 번째 소수점만 남긴다. */
export function sanitizePercentDraft(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const [head = "", ...rest] = cleaned.split(".");
  return rest.length > 0 ? `${head}.${rest.join("")}` : head;
}

/**
 * 금액 입력 아래에 보여줄 만원 단위 읽기 ("123만원"). 1만원 미만이거나 비어 있으면 undefined —
 * 입력값 자체가 이미 정확한 금액을 보여주므로 따로 읽어 줄 필요가 없다.
 */
export function moneyDraftReading(draft: string): string | undefined {
  const won = parseNumericString(draft);
  if (!Number.isFinite(won) || won < MIN_READABLE_WON) return undefined;
  return numberToKorean(won);
}
