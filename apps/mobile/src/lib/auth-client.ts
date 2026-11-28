import { createAuthClient } from "better-auth/react";
import { API_BASE_URL, authorizedFetch } from "./api-client";

// API 서버 주소가 따로면 그쪽 `/api/auth` 로. 비어 있으면 better-auth 가 같은 origin 을 쓴다 (지금 동작).
// 요청은 `authorizedFetch` 로 보낸다 — 네이티브 앱은 세션 토큰을 `Authorization: Bearer` 로 붙이고
// 로그인 응답의 `set-auth-token` 을 저장한다. 브라우저는 그대로 쿠키 세션이다.
// biome-ignore lint/suspicious/noExplicitAny: 추론 타입이 better-auth 내부 타입을 참조해 이름 붙여 export 할 수 없다 (TS2742).
export const authClient: any = createAuthClient({
  baseURL: API_BASE_URL || undefined,
  fetchOptions: { customFetchImpl: authorizedFetch },
});
export const { useSession, signIn, signOut } = authClient;
