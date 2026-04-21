import { auth } from "@web/lib/auth";

/**
 * 개발 환경 전용 카카오 우회 로그인 엔드포인트.
 *
 * 프로덕션 빌드에선 404 만 내려준다. 개발 환경에선 고정된 dev 계정으로
 * better-auth 의 이메일/비밀번호 로그인을 수행해 세션 쿠키를 발급한다.
 * 최초 호출 시엔 계정이 없으므로 signUp 을 먼저 시도한 뒤 signIn 으로 떨어진다.
 */

const DEV_EMAIL = "dev@seedbook.local";
const DEV_PASSWORD = "dev-password-123";
const DEV_NAME = "개발자";
const isDevEnv = process.env.NODE_ENV === "development";

async function signIn(request: Request): Promise<Response> {
  return auth.api.signInEmail({
    body: { email: DEV_EMAIL, password: DEV_PASSWORD },
    headers: request.headers,
    asResponse: true,
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!isDevEnv) {
    return new Response("Not Found", { status: 404 });
  }

  try {
    return await signIn(request);
  } catch {
    // 계정이 없어서 실패한 경우 signUp 후 재시도한다. signUp 은 기본적으로
    // autoSignIn 이 활성화돼 있으므로 바로 세션 쿠키를 돌려준다.
    try {
      return await auth.api.signUpEmail({
        body: { email: DEV_EMAIL, password: DEV_PASSWORD, name: DEV_NAME },
        headers: request.headers,
        asResponse: true,
      });
    } catch {
      return await signIn(request);
    }
  }
}
