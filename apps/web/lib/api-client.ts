/**
 * 클라이언트가 우리 API(`/api/*`)를 부르는 유일한 길. 지금은 같은 origin 이라 기본값이 빈 문자열이고,
 * 앱 번들이 따로 떨어진 API 서버를 부를 때 `NEXT_PUBLIC_API_BASE_URL` 만 바꾸면 된다.
 * 계정 데이터 요청은 이걸 감싼 `accountFetch` (`lib/account-storage.ts`) 로 보낸다.
 * 직접 `fetch("/api/...")` 하지 않는다 — `api-client-guard.test.ts` 가 막는다.
 */
export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");

/** `/api/...` 경로에 API 서버 주소를 붙인다. */
export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

/**
 * API 요청. 문자열 경로에만 API 서버 주소를 붙이고 (`URL`·`Request` 는 이미 완성된 주소라 그대로),
 * `init` (credentials·헤더 등) 은 그대로 넘긴다. 모양이 `fetch` 와 같아 fetch 를 주입받는 곳에 그대로 쓴다.
 */
export const apiFetch: typeof fetch = (input, init) =>
  fetch(typeof input === "string" ? apiUrl(input) : input, init);
