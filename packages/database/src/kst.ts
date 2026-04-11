/**
 * KST (Asia/Seoul, UTC+9) 기준 날짜/요일 계산 유틸.
 *
 * 본 monorepo 의 규약:
 * - Postgres 는 모든 시각을 UTC 로 저장 (`timestamptz`).
 * - Stock 의 trading day 는 "해당 KST 달력일의 자정 (00:00 KST)" 을 canonical
 *   instant 로 저장 — 크롤러는 `kstMidnight()` 로 계산.
 * - 클라이언트/API 가 DB 에서 읽을 때는 KST 로 변환해서 표시/쿼리 — 이 모듈의
 *   헬퍼를 사용.
 *
 * Node 프로세스의 TZ 에 **의존하지 않는다**. 컨테이너가 UTC 로 돌든 KST 로 돌든
 * 동일한 결과를 반환한다. 구현은 UTC 밀리초에 +9h offset 을 더해서 `getUTC*`
 * 로 읽는 방식 — `Intl.DateTimeFormat` 보다 가볍고 테스트가 명시적.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 주어진 Date 의 KST 기준 달력일을 "YYYY-MM-DD" 로 반환.
 * 예: 2025-04-13T20:00:00Z (UTC 일요일 밤) → "2025-04-14" (KST 월요일 아침)
 */
export function kstDateString(date: Date): string {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 주어진 Date 의 KST 기준 달력일을 "YYYYMMDD" 로 반환 (구분자 없음).
 * Naver / KRX API 의 날짜 파라미터 포맷.
 */
export function kstDateStringCompact(date: Date): string {
  return kstDateString(date).replace(/-/g, "");
}

/**
 * 주어진 Date 의 KST 기준 요일. 0=일 … 6=토.
 * 예: 2025-04-13T20:00:00Z (UTC 일요일 밤) → 1 (KST 월요일)
 */
export function kstDayOfWeek(date: Date): number {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  return shifted.getUTCDay();
}

/**
 * 주어진 Date 가 속한 KST 달력일의 KST 자정 (00:00 KST) 을 가리키는 Date.
 * Trading day 를 DB 에 canonical instant 로 저장할 때 사용.
 *
 * 같은 KST 달력일을 가리키는 어떤 입력이 와도 동일한 instant 를 반환하므로
 * `StockPrice` 의 unique index `[stockMarket, stockTicker, date]` 가 의미적으로
 * "같은 날 같은 종목" 을 중복으로 인식한다.
 *
 * 예: 2025-04-14T07:30:00Z (16:30 KST) → Date(2025-04-13T15:00:00Z)
 *     (= 00:00 KST 2025-04-14)
 */
export function kstMidnight(date: Date): Date {
  const kstDay = kstDateString(date);
  // "YYYY-MM-DDT00:00:00+09:00" 는 KST 자정을 명시적으로 가리키는 ISO 문자열.
  // 이 값을 JS Date 로 파싱하면 올바른 UTC instant 가 된다.
  return new Date(`${kstDay}T00:00:00+09:00`);
}
