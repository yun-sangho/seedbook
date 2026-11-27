/**
 * 신상 정보 없는 계정 식별.
 *
 * 소셜 로그인(카카오·Apple)에서 이름·이메일·사진을 받지 않고 provider 의 식별 번호만 쓴다.
 * DB 에 신상과 자산 금액이 함께 있으면 특정 개인의 금액을 쉽게 알 수 있기 때문이다.
 * better-auth 의 `user.email`(notNull unique)·`user.name` 자리는 식별 번호로 만든 고정 값으로 채운다.
 */

/** 실제로 메일을 받을 수 없는 도메인 (RFC 2606 `.invalid`). */
export const ANONYMOUS_EMAIL_DOMAIN = "users.seedbook.invalid";

/** 가입할 때 넣는 기본 이름. 사용자가 프로필에서 바꿀 수 있고, 재로그인이 덮어쓰지 않는다. */
export const ANONYMOUS_USER_NAME = "사용자";

/** provider 와 그 provider 의 계정 식별 번호로 만든 고정 이메일. 같은 계정이면 늘 같은 값이다. */
export function anonymousEmail(providerId: string, accountId: string): string {
  return `${providerId}-${accountId}@${ANONYMOUS_EMAIL_DOMAIN}`.toLowerCase();
}

export function isAnonymousEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${ANONYMOUS_EMAIL_DOMAIN}`);
}
