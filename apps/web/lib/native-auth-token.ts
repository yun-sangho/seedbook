import { isNativeAppOrigin } from "@web/lib/cors";
import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";

const AUTH_TOKEN_HEADER = "set-auth-token";
const EXPOSE_HEADERS = "access-control-expose-headers";

/**
 * better-auth `bearer()` 는 세션 쿠키를 거는 모든 응답에 세션 토큰(`set-auth-token`)을 붙인다. 그 토큰이
 * 필요한 것은 네이티브 앱(앱 번들, origin `capacitor://localhost`·`https://localhost`)뿐이다.
 * 브라우저·같은 origin·Origin 이 없는 요청(웹 OAuth 콜백 리다이렉트 등)의 응답에서는 헤더를 지워
 * 브라우저 JS 가 세션 토큰을 읽을 길을 없앤다 — 웹은 httpOnly 쿠키만 쓴다.
 *
 * `bearer()` 다음에 둔다: 플러그인 after 훅은 넣은 순서로 돌아 `bearer()` 가 붙인 헤더를 여기서 지운다.
 */
export function nativeAppAuthToken(): BetterAuthPlugin {
  return {
    id: "native-app-auth-token",
    hooks: {
      after: [
        {
          matcher: () => true,
          handler: createAuthMiddleware(async (ctx) => {
            const headers = ctx.context.responseHeaders;
            if (!headers?.has(AUTH_TOKEN_HEADER)) return;
            const origin = ctx.request?.headers.get("origin") ?? ctx.headers?.get("origin") ?? null;
            if (isNativeAppOrigin(origin)) return;

            headers.delete(AUTH_TOKEN_HEADER);
            const exposed = (headers.get(EXPOSE_HEADERS) ?? "")
              .split(",")
              .map((name) => name.trim())
              .filter((name) => name && name.toLowerCase() !== AUTH_TOKEN_HEADER);
            if (exposed.length > 0) headers.set(EXPOSE_HEADERS, exposed.join(", "));
            else headers.delete(EXPOSE_HEADERS);
          }),
        },
      ],
    },
  };
}
