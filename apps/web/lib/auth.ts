import { DEFAULT_RETURN_PATH } from "@mobile/lib/login-flow";
import { db, schema } from "@seedbook/database";
import { createAppleClientSecret, readAppleConfig } from "@web/lib/apple-auth";
import {
  appleProviderOptions,
  kakaoProviderOptions,
  privacyAccountOptions,
  privacyDatabaseHooks,
} from "@web/lib/auth-privacy";
import { NATIVE_APP_ORIGINS } from "@web/lib/cors";
import { createKakaoIdTokenVerifier, kakaoIdTokenAudiences } from "@web/lib/kakao-id-token";
import { nativeAppAuthToken } from "@web/lib/native-auth-token";
import { deviceCredentialPlugin } from "@web/server/device-credentials/device-credential-plugin";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";

// 개발 환경에선 카카오 앱 설정 없이도 로그인할 수 있도록 이메일/비밀번호
// 프로바이더를 함께 활성화한다. 프로덕션 빌드(`NODE_ENV !== "development"`)
// 에는 포함되지 않으므로 실제 서비스에는 노출되지 않는다.
const isDevEnv = process.env.NODE_ENV === "development";

// Sign in with Apple — 키 환경변수가 모두 있을 때만 켠다 (`lib/apple-auth.ts`).
const appleConfig = readAppleConfig(process.env);

/** 로그인 화면이 Apple 버튼을 보여줄지 판단할 때 쓴다 (`/api/auth-providers`). */
export const isAppleSignInEnabled = appleConfig !== null;

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  ...(isDevEnv ? { emailAndPassword: { enabled: true } } : {}),
  // 회원 탈퇴 (앱 스토어 요건). user 행을 지우면 모든 자산 테이블이 cascade 로 지워진다.
  // 비밀번호가 없는 소셜 로그인이라 세션이 freshAge(기본 1일) 이내일 때만 허용된다 —
  // 오래된 세션은 SESSION_EXPIRED 로 거절되고 클라이언트가 재로그인을 안내한다.
  user: {
    deleteUser: { enabled: true },
  },
  // 이름·이메일·사진·OAuth 토큰·접속 IP/User-Agent 를 저장하지 않는다 (`lib/auth-privacy.ts`).
  // 로그인 수단 연결(카카오 ↔ Apple)은 로그인한 사용자가 직접 할 때만 된다 (`privacyAccountOptions`).
  account: privacyAccountOptions,
  databaseHooks: privacyDatabaseHooks(db),
  socialProviders: {
    kakao: kakaoProviderOptions({
      clientId: process.env.KAKAO_CLIENT_ID ?? "",
      clientSecret: process.env.KAKAO_CLIENT_SECRET ?? "",
      // 네이티브 앱의 카카오 SDK 로그인 (ID 토큰). 대상 앱 키가 없으면 모두 거절한다.
      verifyIdToken: createKakaoIdTokenVerifier({ audiences: kakaoIdTokenAudiences(process.env) }),
    }),
    ...(appleConfig
      ? {
          apple: appleProviderOptions({
            clientId: appleConfig.clientId,
            clientSecret: createAppleClientSecret(appleConfig),
            // 웹(Services ID)과 네이티브 앱(번들 ID)이 받은 id token 을 모두 받는다.
            audience: [appleConfig.clientId, ...appleConfig.appBundleIdentifiers],
          }),
        }
      : {}),
  },
  // 시작할 때 준 `errorCallbackURL` 을 알 수 없는 실패(만료된 state 등)도 better-auth 의 영어 오류
  // 페이지 대신 로그인 화면으로 보낸다. `?error=` 를 로그인 화면이 안내로 바꾼다.
  onAPIError: { errorURL: DEFAULT_RETURN_PATH },
  plugins: [
    // 네이티브 앱 생체 인증 로그인 (`server/device-credentials/`).
    deviceCredentialPlugin({ db }),
    // 네이티브 앱(앱 번들)은 쿠키 대신 `Authorization: Bearer <세션 토큰>` 으로 보낸다. 세션을 만드는
    // 응답(로그인·생체 인증 로그인)에 `set-auth-token` 헤더로 토큰을 준다. 브라우저는 지금처럼 쿠키.
    bearer(),
    // 그 토큰은 앱 origin 요청의 응답에만 남긴다 — 브라우저 JS 는 세션 토큰을 읽지 못한다. bearer() 다음.
    nativeAppAuthToken(),
  ],
  trustedOrigins: [
    // 앱 번들의 origin (iOS `capacitor://localhost`, Android `https://localhost`). CORS 는 `proxy.ts`.
    ...NATIVE_APP_ORIGINS,
    // Apple 은 콜백을 appleid.apple.com 에서 form_post 로 보낸다.
    ...(appleConfig ? ["https://appleid.apple.com"] : []),
  ],
});
