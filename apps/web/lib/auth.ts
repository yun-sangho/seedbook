import { prisma } from "@seedbook/database";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

// 개발 환경에선 카카오 앱 설정 없이도 로그인할 수 있도록 이메일/비밀번호
// 프로바이더를 함께 활성화한다. 프로덕션 빌드(`NODE_ENV !== "development"`)
// 에는 포함되지 않으므로 실제 서비스에는 노출되지 않는다.
const isDevEnv = process.env.NODE_ENV === "development";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  ...(isDevEnv ? { emailAndPassword: { enabled: true } } : {}),
  socialProviders: {
    kakao: {
      clientId: process.env.KAKAO_CLIENT_ID ?? "",
      clientSecret: process.env.KAKAO_CLIENT_SECRET ?? "",
      // account_email 은 카카오 비즈앱 심사 스코프라 일반 개발 앱에선
      // KOE205 가 난다. 기본 스코프를 끄고 필수 두 개만 요청한다.
      disableDefaultScope: true,
      scope: ["profile_nickname", "profile_image"],
      // User.email 은 @unique NOT NULL 이라 이메일 동의 없이도
      // 충돌 없는 합성 주소를 넣어 준다. kakao user id 는 전역 유일.
      mapProfileToUser: (profile) => ({
        email: `${profile.id}@kakao.local`,
        emailVerified: false,
      }),
    },
  },
});
