import { ANONYMOUS_USER_NAME, anonymousEmail } from "@seedbook/database";
import type { BetterAuthOptions } from "better-auth";

/**
 * 로그인에서 신상 정보를 저장하지 않게 하는 better-auth 설정 (`packages/database/src/anonymous-identity.ts`).
 *
 * - 카카오·Apple 에 동의 항목(이름·이메일·사진)을 요청하지 않고 식별 번호만 쓴다.
 * - better-auth 가 요구하는 `user.email`·`user.name` 은 식별 번호로 만든 고정 값으로 채운다. 이미 가입한
 *   사람은 (provider, 식별 번호) 로 계정을 찾으므로 다시 로그인해도 같은 계정이다.
 * - 재로그인이 이름·사진을 provider 프로필로 덮어쓰지 않는다 (`overrideUserInfoOnSignIn` 기본값 false).
 * - OAuth 토큰과 세션의 접속 IP·User-Agent 를 DB 에 남기지 않는다 (`privacyDatabaseHooks`).
 */

/** 신상 정보 없는 사용자 필드. provider 가 준 이름·사진은 버린다. */
export function anonymousUserFields(providerId: string, accountId: string | number) {
  return {
    email: anonymousEmail(providerId, String(accountId)),
    name: ANONYMOUS_USER_NAME,
    image: undefined,
    emailVerified: false,
  };
}

export function kakaoProviderOptions(credentials: { clientId: string; clientSecret: string }) {
  return {
    ...credentials,
    // 동의 항목을 하나도 요청하지 않는다 — 카카오 회원번호만 받는다.
    disableDefaultScope: true,
    scope: [],
    mapProfileToUser: (profile: { id: number | string }) =>
      anonymousUserFields("kakao", profile.id),
  };
}

export function appleProviderOptions<T extends object>(credentials: T) {
  return {
    ...credentials,
    // email·name 범위를 요청하지 않는다 — id token 의 sub 만 쓴다.
    disableDefaultScope: true,
    scope: [],
    mapProfileToUser: (profile: { sub: string }) => anonymousUserFields("apple", profile.sub),
  };
}

const NO_OAUTH_TOKENS = {
  accessToken: null,
  refreshToken: null,
  idToken: null,
  accessTokenExpiresAt: null,
  refreshTokenExpiresAt: null,
};

const NO_CLIENT_INFO = { ipAddress: null, userAgent: null };

/**
 * 저장 직전에 OAuth 토큰과 세션 접속 정보를 지운다. better-auth 의 IP 추적 자체(`disableIpTracking`)는
 * 끄지 않는다 — 요청 IP 는 로그인 rate limit 에 쓰이고, 저장만 하지 않으면 된다.
 */
export const privacyDatabaseHooks = {
  account: {
    create: { before: async (data) => ({ data: { ...data, ...NO_OAUTH_TOKENS } }) },
    update: { before: async (data) => ({ data: { ...data, ...NO_OAUTH_TOKENS } }) },
  },
  session: {
    create: { before: async (data) => ({ data: { ...data, ...NO_CLIENT_INFO } }) },
    update: { before: async (data) => ({ data: { ...data, ...NO_CLIENT_INFO } }) },
  },
} satisfies BetterAuthOptions["databaseHooks"];
