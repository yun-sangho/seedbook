/** 숫자만 남기고 천 단위 쉼표를 붙인다 (원/주 정수 입력용). 빈 입력은 빈 문자열. */
export function formatMoneyDraft(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
  return digits === "" ? "" : Number(digits).toLocaleString();
}

/** 소수 허용 비중 입력 정리: 숫자와 첫 번째 소수점만 남긴다. */
export function sanitizePercentDraft(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const [head = "", ...rest] = cleaned.split(".");
  return rest.length > 0 ? `${head}.${rest.join("")}` : head;
}
