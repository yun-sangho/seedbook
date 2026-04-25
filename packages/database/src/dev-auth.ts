/**
 * 개발 환경 전용 dev 계정/세션 상수.
 *
 * seed (`packages/database/prisma/seed.ts`) 가 user + session 행을 upsert 로
 * 만들어 두고, `apps/web/app/api/auth/dev-login/route.ts` 가 동일한 토큰을
 * Better Auth 쿠키 포맷으로 서명해 브라우저에 내려준다. 두 쪽이 같은 상수를
 * 공유해야 동작이 맞물리므로 이 파일이 단일 출처다.
 *
 * Better Auth 쿠키 이름 규약: `${prefix}.${cookie_name}`, 기본 prefix는
 * "better-auth". 여기서는 기본값을 그대로 쓴다.
 */

export const DEV_USER_ID = "dev-user-v1";
export const DEV_USER_EMAIL = "dev@seedbook.local";
export const DEV_USER_NAME = "개발자";

export const DEV_SESSION_ID = "dev-session-v1";
// 쿠키 값의 앞부분(.앞). Better Auth 는 이 값을 session.token 과 대조한다.
export const DEV_SESSION_TOKEN = "dev-session-token-v1";

export const DEV_SESSION_COOKIE_NAME = "better-auth.session_token";
