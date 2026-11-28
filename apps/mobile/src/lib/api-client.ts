import { nativeSessionToken, type SessionTokenStore } from "./native/session-token";

/**
 * 클라이언트가 우리 API(`/api/*`)를 부르는 유일한 길. 지금은 같은 origin 이라 기본값이 빈 문자열이고,
 * 앱 번들이 따로 떨어진 API 서버를 부를 때 빌드 환경변수 `SEEDBOOK_API_BASE_URL` 만 바꾸면 된다
 * (vite.config.ts 가 빌드 때 값을 넣는다).
 * 계정 데이터 요청은 이걸 감싼 `accountFetch` (`lib/account-storage.ts`) 로 보낸다.
 * 직접 `fetch("/api/...")` 하지 않는다 — `api-client-guard.test.ts` 가 막는다.
 */
export const API_BASE_URL = (process.env.SEEDBOOK_API_BASE_URL ?? "").replace(/\/+$/, "");

/** `/api/...` 경로에 API 서버 주소를 붙인다. */
export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

/** 세션을 끝내는 better-auth 경로. 성공하면 앱의 세션 토큰도 지운다. */
const SESSION_ENDING_PATHS = ["/api/auth/sign-out", "/api/auth/delete-user"];

function requestPath(input: Parameters<typeof fetch>[0]): string {
  const url = input instanceof Request ? input.url : String(input);
  try {
    return new URL(url, "http://localhost").pathname;
  } catch {
    return url;
  }
}

/**
 * 네이티브 앱의 bearer 세션 (`lib/native/session-token.ts`).
 * - 토큰이 있으면 `Authorization: Bearer` 를 붙인다 (요청이 이미 Authorization 을 정했으면 그대로).
 * - 응답의 `set-auth-token` (로그인·생체 인증 로그인이 새 세션을 만들 때) 을 저장한다 — 다른 계정으로
 *   로그인하면 그 계정 토큰으로 바뀐다.
 * - 로그아웃·탈퇴가 성공하면 지운다.
 * 토큰이 없으면 (브라우저·구버전 앱) 요청을 그대로 보낸다 — 쿠키 세션.
 */
export function createAuthorizedFetch(
  fetchImpl: typeof fetch,
  tokens: SessionTokenStore
): typeof fetch {
  return async (input, init) => {
    // 브라우저: 지금과 똑같이 곧바로 보낸다 (await 를 끼우지 않는다).
    if (!tokens.enabled()) return fetchImpl(input, init);
    const token = await tokens.read();
    let response: Response;
    if (token) {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : {}));
      if (!headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);
      response = await fetchImpl(input, { ...init, headers });
    } else {
      response = await fetchImpl(input, init);
    }

    const issued = response.headers.get("set-auth-token");
    if (issued) await tokens.save(issued);
    else if (response.ok && SESSION_ENDING_PATHS.includes(requestPath(input))) await tokens.clear();
    return response;
  };
}

/** 이미 완성된 주소로 보내는 인증 요청 (better-auth 클라이언트가 쓴다, `lib/auth-client.ts`). */
export const authorizedFetch: typeof fetch = createAuthorizedFetch(
  (input, init) => fetch(input, init),
  nativeSessionToken
);

/**
 * API 요청. 문자열 경로에만 API 서버 주소를 붙이고 (`URL`·`Request` 는 이미 완성된 주소라 그대로),
 * `init` (credentials·헤더 등) 은 그대로 넘긴다 (네이티브 앱은 세션 토큰만 더한다). 모양이 `fetch` 와
 * 같아 fetch 를 주입받는 곳에 그대로 쓴다.
 */
export const apiFetch: typeof fetch = (input, init) =>
  authorizedFetch(typeof input === "string" ? apiUrl(input) : input, init);
