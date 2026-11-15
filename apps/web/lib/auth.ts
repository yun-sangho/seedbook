import { db, schema } from "@seedbook/database";
import { createAppleClientSecret, readAppleConfig } from "@web/lib/apple-auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

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
  socialProviders: {
    kakao: {
      clientId: process.env.KAKAO_CLIENT_ID ?? "",
      clientSecret: process.env.KAKAO_CLIENT_SECRET ?? "",
      disableDefaultScope: true,
      scope: ["profile_nickname", "profile_image", "account_email"],
    },
    ...(appleConfig
      ? {
          apple: {
            clientId: appleConfig.clientId,
            clientSecret: createAppleClientSecret(appleConfig),
            appBundleIdentifier: appleConfig.appBundleIdentifier,
          },
        }
      : {}),
  },
  // Apple 은 콜백을 appleid.apple.com 에서 form_post 로 보낸다.
  ...(appleConfig ? { trustedOrigins: ["https://appleid.apple.com"] } : {}),
});
