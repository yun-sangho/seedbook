/**
 * 서버 ↔ 클라이언트 envelope 번역 계층 공통 타입.
 *
 * 각 store 는 `{ state, version }` envelope 를 사용한다. 서버에서 envelope 의
 * 내용을 DB row 로 해체하고, 다시 응답 시 row 들을 envelope 로 조립한다.
 */

import { prisma } from "@seedbook/database";

// `@seedbook/database` 가 export 하는 실제 싱글턴의 타입을 그대로 쓴다. Prisma
// 자동 생성 제네릭이 붙은 정확한 타입이라 메서드 추론이 깔끔하다.
export type Prisma = typeof prisma;

/**
 * Translator 가 반환하는 envelope 모양.
 *
 * `state` 는 도메인 별로 다르고 (`investments` 배열, `plans` 배열 등) `version` 은
 * 해당 store 의 현재 persist version 과 동일해야 한다.
 */
export type Envelope = {
  state: Record<string, unknown>;
  version: number;
};

/**
 * 한 도메인의 read / write 번역기.
 *
 * - `read`: DB 에서 userId 에 해당하는 row 들을 읽어 envelope 로 조립.
 * - `write`: 클라이언트가 보낸 envelope 를 받아 DB row 를 upsert + stale row 삭제.
 */
export interface DomainTranslator {
  read(prisma: Prisma, userId: string): Promise<Envelope | null>;
  write(prisma: Prisma, userId: string, envelope: Envelope): Promise<void>;
}

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
