/**
 * DB 행 ↔ 클라이언트 표현 변환에 쓰는 값 변환. 서버 envelope 번역기 · 엔티티 동기화 · 기기 SQLite
 * (`apps/web/lib/native/device-db`)가 같은 변환을 쓴다.
 */

/**
 * BigInt → Number 변환 헬퍼. JS Number.MAX_SAFE_INTEGER 를 넘는 값은 절대 없다는
 * 전제 (원 단위 자산 데이터라 수 조 이상일 일이 없음).
 */
export function bigIntToNumber(value: bigint): number {
  return Number(value);
}

/**
 * Number → BigInt 헬퍼. 입력이 number 면 정수로 캐스팅, 이미 bigint 면 그대로.
 */
export function toBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string") return BigInt(value);
  return 0n;
}

/**
 * YYYY-MM-DD 문자열을 UTC Date (자정 기준) 로 파싱. Prisma `@db.Date` 컬럼은
 * timezone 없이 저장되므로 클라이언트 → 서버 전환에서 타임존 이슈가 없다.
 */
export function parseDate(value: unknown): Date | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(`${trimmed.substring(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * DB Date → "YYYY-MM-DD" 문자열.
 */
export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0] || "";
}
