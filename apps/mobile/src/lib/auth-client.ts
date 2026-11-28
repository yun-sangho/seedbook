import { useEffect, useSyncExternalStore } from "react";
import { createAuthClient } from "better-auth/react";
import { API_BASE_URL, authorizedFetch } from "./api-client";
import { offlineSession, resolveSession, type SessionQueryState } from "./offline-session";
import { maskPendingSignOut, pendingSignOut, sessionIdOf } from "./pending-sign-out";

// API 서버 주소가 따로면 그쪽 `/api/auth` 로. 비어 있으면 better-auth 가 같은 origin 을 쓴다 (브라우저).
// 요청은 `authorizedFetch` 로 보낸다 — 네이티브 앱은 세션 토큰을 `Authorization: Bearer` 로 붙이고
// 로그인 응답의 `set-auth-token` 을 저장한다. 브라우저는 그대로 쿠키 세션이다.
// biome-ignore lint/suspicious/noExplicitAny: 추론 타입이 better-auth 내부 타입을 참조해 이름 붙여 export 할 수 없다 (TS2742).
export const authClient: any = createAuthClient({
  baseURL: API_BASE_URL || undefined,
  fetchOptions: { customFetchImpl: authorizedFetch },
});
export const { signIn, signOut } = authClient;

let lastSessionId: string | null = null;

/** 서버가 마지막으로 확인한 세션 id (로그아웃이 끝내지 못한 세션을 적을 때, `lib/sign-out.ts`). */
export function currentSessionId(): string | null {
  return lastSessionId;
}

let retryingSignOut = false;

/** 끝내지 못한 로그아웃을 다시 보낸다. 성공하면 표시를 지운다 (세션 확인도 다시 돈다). */
async function retryPendingSignOut(): Promise<void> {
  if (retryingSignOut) return;
  retryingSignOut = true;
  try {
    const result = await authClient.signOut();
    if (!result?.error) await pendingSignOut.clear();
  } catch {
    // 아직 닿지 않는다 — 표시를 두고 다음에 다시 보낸다.
  } finally {
    retryingSignOut = false;
  }
}

/**
 * 로그인 세션 (better-auth `useSession`). 네이티브 앱은 서버에 닿지 못하면 (네트워크 오류·5xx) 마지막으로
 * 확인한 세션으로 연다 — 오프라인에서도 기기 데이터를 본다 (`lib/offline-session.ts`). 서버가 세션이
 * 없다고 답할 때만 닫는다. 브라우저는 better-auth 결과 그대로다. 로그아웃했지만 서버가 끝내지 못한
 * 세션(`lib/pending-sign-out.ts`)은 앱·브라우저 모두 로그인하지 않은 것으로 본다.
 */
// biome-ignore lint/suspicious/noExplicitAny: better-auth 세션 타입을 그대로 돌려준다 (위 authClient 와 같은 이유).
export function useSession(): any {
  const server = authClient.useSession() as SessionQueryState;
  const pending = useSyncExternalStore(
    pendingSignOut.subscribe,
    pendingSignOut.get,
    pendingSignOut.get
  );
  // 로그아웃했지만 서버가 끝내지 못한 세션은 로그인하지 않은 것으로 본다 (`lib/sign-out.ts`).
  const masked = maskPendingSignOut(server, pending);
  const real = masked.state;
  const remembered = useSyncExternalStore(
    offlineSession.subscribe,
    offlineSession.get,
    offlineSession.get
  );
  const { state, action } = resolveSession(real, remembered, offlineSession.enabled());
  const data = real.data;
  const sessionId = sessionIdOf(server.data);
  useEffect(() => {
    if (sessionId) lastSessionId = sessionId;
  }, [sessionId]);
  useEffect(() => {
    if (masked.action === "retry") void retryPendingSignOut();
    else if (masked.action === "clear") void pendingSignOut.clear();
  }, [masked.action]);
  useEffect(() => {
    if (action === "remember") void offlineSession.remember(data);
    else if (action === "forget") void offlineSession.forget();
  }, [action, data]);
  return state;
}
