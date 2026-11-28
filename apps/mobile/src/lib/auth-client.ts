import { useEffect, useSyncExternalStore } from "react";
import { createAuthClient } from "better-auth/react";
import { API_BASE_URL, authorizedFetch } from "./api-client";
import { offlineSession, resolveSession, type SessionQueryState } from "./offline-session";

// API 서버 주소가 따로면 그쪽 `/api/auth` 로. 비어 있으면 better-auth 가 같은 origin 을 쓴다 (브라우저).
// 요청은 `authorizedFetch` 로 보낸다 — 네이티브 앱은 세션 토큰을 `Authorization: Bearer` 로 붙이고
// 로그인 응답의 `set-auth-token` 을 저장한다. 브라우저는 그대로 쿠키 세션이다.
// biome-ignore lint/suspicious/noExplicitAny: 추론 타입이 better-auth 내부 타입을 참조해 이름 붙여 export 할 수 없다 (TS2742).
export const authClient: any = createAuthClient({
  baseURL: API_BASE_URL || undefined,
  fetchOptions: { customFetchImpl: authorizedFetch },
});
export const { signIn, signOut } = authClient;

/**
 * 로그인 세션 (better-auth `useSession`). 네이티브 앱은 서버에 닿지 못하면 (네트워크 오류·5xx) 마지막으로
 * 확인한 세션으로 연다 — 오프라인에서도 기기 데이터를 본다 (`lib/offline-session.ts`). 서버가 세션이
 * 없다고 답할 때만 닫는다. 브라우저는 better-auth 결과 그대로다.
 */
// biome-ignore lint/suspicious/noExplicitAny: better-auth 세션 타입을 그대로 돌려준다 (위 authClient 와 같은 이유).
export function useSession(): any {
  const real = authClient.useSession() as SessionQueryState;
  const remembered = useSyncExternalStore(
    offlineSession.subscribe,
    offlineSession.get,
    offlineSession.get
  );
  const { state, action } = resolveSession(real, remembered, offlineSession.enabled());
  const data = real.data;
  useEffect(() => {
    if (action === "remember") void offlineSession.remember(data);
    else if (action === "forget") void offlineSession.forget();
  }, [action, data]);
  return state;
}
