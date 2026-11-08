/** "11월 8일" — 올해가 아니면 "2025년 11월 8일". 잘못된 값은 빈 문자열. */
export function formatRebalancingDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const monthDay = `${date.getMonth() + 1}월 ${date.getDate()}일`;
  return date.getFullYear() === now.getFullYear()
    ? monthDay
    : `${date.getFullYear()}년 ${monthDay}`;
}
