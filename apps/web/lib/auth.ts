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
      disableDefaultScope: true,
      scope: ["profile_nickname", "profile_image", "account_email"],
    },
  },
});
