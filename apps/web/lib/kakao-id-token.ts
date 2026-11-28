import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose";

/**
 * 네이티브 앱의 카카오 로그인(카카오 SDK → OIDC ID 토큰) 검증.
 *
 * better-auth 1.7 의 카카오 provider 는 ID 토큰 검증 설정(`idToken`)이 없어 `signIn.social({ idToken })`
 * 을 `ID_TOKEN_NOT_SUPPORTED` 로 거절한다. provider 옵션 `verifyIdToken` 을 주면 그 경로가 열린다
 * (`supportsIdTokenSignIn`). 여기서 카카오 공개키(JWKS)로 서명·발급자·대상·만료·nonce 를 확인한다.
 * https://developers.kakao.com/docs/latest/ko/kakaologin/utilize (ID 토큰 검증)
 *
 * - 대상(`aud`)은 토큰을 받은 앱 키다. 카카오 SDK 는 네이티브 앱 키(`KAKAO_NATIVE_APP_KEY`)로 받는다.
 *   REST API 키(`KAKAO_CLIENT_ID`, 웹 로그인)로 받은 토큰도 우리 앱 것이라 받는다.
 * - nonce 는 반드시 받는다. 앱이 로그인마다 새로 만들어 SDK 에 넘기고 같은 값을 서버로 보낸다.
 * - 발급 직후에만 쓰는 토큰이라 오래된 것(`iat` 10분 초과)은 거절한다 — 새어 나간 토큰을 다시 쓰는
 *   창을 줄인다.
 */
export const KAKAO_ISSUER = "https://kauth.kakao.com";
const KAKAO_JWKS_URL = new URL("https://kauth.kakao.com/.well-known/jwks.json");
const MAX_TOKEN_AGE = "10m";
const CLOCK_TOLERANCE_SECONDS = 30;

let remoteJwks: JWTVerifyGetKey | null = null;

/** 카카오 JWKS. jose 가 키를 캐시하고, 모르는 `kid` 면 다시 받는다. */
function kakaoJwks(): JWTVerifyGetKey {
  remoteJwks ??= createRemoteJWKSet(KAKAO_JWKS_URL);
  return remoteJwks;
}

export function kakaoIdTokenAudiences(env: Record<string, string | undefined>): string[] {
  return [env.KAKAO_NATIVE_APP_KEY, env.KAKAO_CLIENT_ID]
    .map((value) => value?.trim() ?? "")
    .filter((value) => value.length > 0);
}

/**
 * better-auth provider 옵션 `verifyIdToken` 으로 쓰는 검증 함수. 대상이 하나도 설정되지 않았으면 모두
 * 거절한다. 예외를 던지지 않고 false 를 돌려준다.
 */
export function createKakaoIdTokenVerifier(options: {
  audiences: string[];
  jwks?: JWTVerifyGetKey;
}): (token: string, nonce?: string) => Promise<boolean> {
  return async (token, nonce) => {
    if (options.audiences.length === 0 || !nonce) return false;
    try {
      const { payload } = await jwtVerify(token, options.jwks ?? kakaoJwks(), {
        issuer: KAKAO_ISSUER,
        audience: options.audiences,
        algorithms: ["RS256"],
        requiredClaims: ["iss", "sub", "aud", "exp", "iat", "nonce"],
        maxTokenAge: MAX_TOKEN_AGE,
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
      });
      return payload.nonce === nonce && typeof payload.sub === "string" && payload.sub.length > 0;
    } catch {
      return false;
    }
  };
}
