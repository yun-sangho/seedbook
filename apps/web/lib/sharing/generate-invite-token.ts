import { randomBytes } from "crypto";

/**
 * 1회용 초대 토큰. URL 에 직접 노출되므로 공유 코드보다 더 큰 엔트로피를 쓴다.
 * 24 bytes = 192 bits → base64url 32 글자. 무차별 대입 안전.
 */
export function generateInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * 초대 링크 기본 만료 기간 (밀리초). 7 일.
 */
export const INVITE_DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
