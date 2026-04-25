import { createHmac } from "crypto";
import { DEV_SESSION_COOKIE_NAME, DEV_SESSION_TOKEN } from "@seedbook/database";

/**
 * 개발 환경 전용 카카오 우회 로그인 엔드포인트.
 *
 * Better Auth API 는 타지 않는다. seed 가 dev@seedbook.local 유저와 고정 토큰
 * 세션을 미리 만들어 두므로, 이 라우트는 Better Auth 가 검증 가능한 포맷
 * (token.hmacBase64) 으로 서명해 쿠키만 내려주면 된다.
 *
 * 프로덕션 빌드에선 404 만 내려준다.
 */

const isDevEnv = process.env.NODE_ENV === "development";

// Better Auth 의 signCookieValue 와 동일한 값을 만든다:
//   1. HMAC-SHA256(token, secret) 을 base64 로 인코딩 (44자, 끝에 = 패딩 1개)
//   2. "token.signature" 형태로 합친 뒤
//   3. encodeURIComponent 로 감싼다 (Better Auth 파서가 % 를 보면 decode 한다)
//
// Node createHmac 의 base64 digest 는 브라우저 btoa 와 같은 표준 base64 라
// 바이트열이 동일하다.
function signToken(token: string, secret: string): string {
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return encodeURIComponent(`${token}.${signature}`);
}

export async function POST(): Promise<Response> {
  if (!isDevEnv) {
    return new Response("Not Found", { status: 404 });
  }

  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    return new Response("BETTER_AUTH_SECRET is not set", { status: 500 });
  }

  const cookieValue = signToken(DEV_SESSION_TOKEN, secret);
  const maxAgeSeconds = 60 * 60 * 24 * 365;

  const headers = new Headers();
  headers.append(
    "Set-Cookie",
    [
      `${DEV_SESSION_COOKIE_NAME}=${cookieValue}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${maxAgeSeconds}`,
    ].join("; ")
  );
  return new Response(null, { status: 204, headers });
}
