import { randomBytes } from "crypto";

/**
 * URL-safe 한 12 문자 공유 코드를 생성한다. base64url (A-Z, a-z, 0-9, -, _)
 * 알파벳 사용. 9 bytes 엔트로피 = 72 bits. 충돌 가능성은 사실상 0.
 *
 * 순수 함수 — Prisma 에 의존하지 않아 단위 테스트가 가능하다.
 */
export function generateShareCode(): string {
  return randomBytes(9).toString("base64url");
}
