/**
 * 네이티브 앱이 앱 번들(서버를 WebView 로 띄우지 않는 구조)에서 `/api` 를 부를 때의 CORS.
 *
 * 앱 화면의 origin 은 iOS `capacitor://localhost`, Android `https://localhost` 다. 이 둘만 허용한다 —
 * 브라우저(모바일 웹)는 지금처럼 같은 origin 이라 CORS 와 상관없다. 앱은 쿠키 대신
 * `Authorization: Bearer` 로 세션을 보내고, 로그인 응답의 `set-auth-token` 헤더로 토큰을 받는다
 * (better-auth `bearer()`, `lib/auth.ts`).
 *
 * `Access-Control-Allow-Credentials` 도 켠다 — better-auth 클라이언트가 `credentials: "include"` 로
 * 보내 이것이 없으면 브라우저가 응답을 막는다. 세션 쿠키는 SameSite=Lax 라 다른 사이트(`localhost`)의
 * fetch 에는 실리지 않으므로 쿠키 세션이 이 origin 들에 열리지는 않는다.
 */
export const NATIVE_APP_ORIGINS = ["capacitor://localhost", "https://localhost"] as const;

const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
/** 미리 묻는 요청(preflight)이 헤더를 알리지 않을 때 허용하는 헤더. */
const DEFAULT_ALLOWED_HEADERS = "authorization, content-type";
const EXPOSED_HEADERS = "set-auth-token";
const PREFLIGHT_MAX_AGE_SECONDS = "600";

export function isNativeAppOrigin(origin: string | null): origin is string {
  return origin !== null && (NATIVE_APP_ORIGINS as readonly string[]).includes(origin);
}

/**
 * 허용한 origin 이면 응답에 붙일 CORS 헤더, 아니면 null (헤더를 붙이지 않는다 = 브라우저가 막는다).
 * preflight 에는 요청이 알린 헤더를 그대로 허용한다 — origin 이 이미 앱 둘로 묶여 있고, 앱이 새 헤더
 * (`x-seedbook-*`) 를 더할 때마다 여기를 고치지 않아도 된다.
 */
export function corsHeaders(
  request: { origin: string | null; requestedHeaders: string | null },
  preflight: boolean
): Record<string, string> | null {
  if (!isNativeAppOrigin(request.origin)) return null;
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": request.origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Expose-Headers": EXPOSED_HEADERS,
    Vary: "Origin",
  };
  if (preflight) {
    headers["Access-Control-Allow-Methods"] = ALLOWED_METHODS;
    headers["Access-Control-Allow-Headers"] = request.requestedHeaders || DEFAULT_ALLOWED_HEADERS;
    headers["Access-Control-Max-Age"] = PREFLIGHT_MAX_AGE_SECONDS;
  }
  return headers;
}
