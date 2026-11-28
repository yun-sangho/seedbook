import { authClient, currentSessionId } from "./auth-client";
import { APP_HOME } from "./device";
import { restartAppAt } from "./device-storage";
import { markSignedOut } from "./native/biometric-login";
import { isBundledApp } from "./native/bundled-app";
import { stopNotificationsOnSignOut } from "./native/notifications";
import { nativeSessionToken, type SessionTokenStore } from "./native/session-token";
import { type OfflineSession, offlineSession } from "./offline-session";
import { type PendingSignOut, pendingSignOut } from "./pending-sign-out";

/**
 * 로그아웃은 기기 우선이다. 서버 로그아웃을 잠깐 시도하되 결과와 상관없이 이 기기의 로그인을 끝낸다
 * — 앱은 세션 토큰(Keychain/Keystore)과 기억한 세션(`offline-session.ts`)을 지우고, 서버가 끝내지 못한
 * 세션은 `pending-sign-out.ts` 에 남긴다 (브라우저 쿠키는 그 표시로 가리고 다음에 닿을 때 다시 끝낸다).
 * 기기의 계정 데이터는 그대로 둔다 (다른 계정으로 로그인하면 따로 보관된다).
 */
export const SIGN_OUT_TIMEOUT_MS = 4_000;

export interface SignOutDeps {
  /** 서버 로그아웃. 성공하면 true. */
  requestSignOut: () => Promise<boolean>;
  /** 지금 화면의 세션 id (서버가 마지막으로 확인한 것). */
  sessionId: () => string | null;
  tokens: SessionTokenStore;
  offline: Pick<OfflineSession, "clear">;
  pending: Pick<PendingSignOut, "set" | "clear">;
  timeoutMs?: number;
}

async function endServerSession(request: () => Promise<boolean>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([request().catch(() => false), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function createSignOut(deps: SignOutDeps): () => Promise<void> {
  const timeoutMs = deps.timeoutMs ?? SIGN_OUT_TIMEOUT_MS;
  return async () => {
    const sessionId = deps.sessionId();
    // 토큰이 있어야 서버가 어느 세션인지 안다 — 지우기 전에 보낸다.
    const ended = await endServerSession(deps.requestSignOut, timeoutMs);
    await deps.offline.clear().catch(() => undefined);
    // 앱은 토큰을 지우면 그 세션을 다시 쓸 수 없다 — 표시는 앱이 지울 수 없는 브라우저 쿠키에만 남긴다.
    const usesToken = deps.tokens.enabled();
    if (usesToken) await deps.tokens.clear().catch(() => undefined);
    const mark =
      !ended && sessionId && !usesToken ? deps.pending.set(sessionId) : deps.pending.clear();
    await mark.catch(() => undefined);
  };
}

/** 서버 로그아웃 (better-auth). 세션을 끝냈거나 이미 없으면 true. */
export async function requestServerSignOut(): Promise<boolean> {
  const result = await authClient.signOut();
  return !result?.error;
}

export const signOutOnDevice: () => Promise<void> = createSignOut({
  requestSignOut: requestServerSignOut,
  sessionId: () => currentSessionId(),
  tokens: nativeSessionToken,
  offline: offlineSession,
  pending: pendingSignOut,
});

/**
 * 로그아웃 뒤 새로 시작할 주소 — 앱 홈. 번들 앱은 셸 루트(`/`)로 열어 홈으로 옮긴다 (`main.tsx`).
 * 떠난 화면(설정 등)에서 다시 열면 로그인 화면이 그 주소를 복귀 경로로 잡아(`login-flow.ts`) 다음
 * 로그인이 거기로 돌아간다.
 */
export function signedOutStartPath(): string {
  return isBundledApp() ? "/" : APP_HOME;
}

/**
 * 화면의 로그아웃 (설정·로그인 수단·탈퇴 재로그인·약관 거부). 무엇이 실패해도 앱 홈에서 새로 시작해
 * 로그인 화면으로 간다 — history 항목을 바꿔 써 뒤로가기로 떠난 화면에 돌아가지 않는다. 로그인 화면이
 * 생체 인증 프롬프트를 곧바로 다시 띄우지 않게 먼저 표시한다.
 */
export async function signOutAndReload(): Promise<void> {
  try {
    markSignedOut(window.sessionStorage);
  } catch {
    // sessionStorage 를 쓸 수 없으면 프롬프트가 한 번 더 뜰 뿐이다.
  }
  // 세션이 살아 있을 때 알림 등록부터 끊는다 — 서버에 닿지 못해도 오래 기다리지 않는다.
  await Promise.race([
    stopNotificationsOnSignOut(),
    new Promise((resolve) => setTimeout(resolve, SIGN_OUT_TIMEOUT_MS)),
  ]);
  await signOutOnDevice().catch(() => undefined);
  await restartAppAt(signedOutStartPath());
}
