import type { SocialProvider } from "@mobile/lib/last-login-method";
import { isBundledApp } from "./bundled-app";

/**
 * 네이티브 앱의 카카오·Apple 로그인 (`packages/native-plugins`).
 *
 * - 카카오: 카카오 SDK (카카오톡 앱 로그인, 없으면 카카오계정 화면) → OIDC ID 토큰.
 * - Apple: Sign in with Apple (iOS `AuthenticationServices`) → identity token.
 * 앱은 ID 토큰과 nonce 를 서버 `signIn.social({ idToken })`·`linkSocial({ idToken })` 로 보내고, 서버가
 * 서명·대상·nonce 를 확인해 세션을 만든다 (`apps/web/lib/kakao-id-token.ts`, better-auth Apple).
 *
 * 플러그인이 없거나(브라우저·구버전 앱·Android 의 Apple) 키가 설정되지 않은 빌드면 `null` — 지금처럼
 * 웹 OAuth 로 로그인한다. 웹 배포가 앱보다 먼저 나가므로 이 갈래가 꼭 필요하다.
 */

export const NATIVE_LOGIN_PLUGINS: Record<SocialProvider, string> = {
  kakao: "SeedbookKakaoLogin",
  apple: "SeedbookAppleSignIn",
};

/** 사용자가 로그인 화면을 닫았을 때 플러그인이 거절하는 코드. */
export const NATIVE_LOGIN_CANCELLED = "CANCELLED";

export interface NativeIdTokenPlugin {
  /** SDK 키·플랫폼이 준비돼 이 기기에서 네이티브 로그인을 할 수 있는지. */
  isAvailable(): Promise<{ available: boolean }>;
  /**
   * 로그인하고 ID 토큰을 받는다. 카카오는 nonce 를 그대로, Apple 은 SHA-256 (hex) 으로 요청에 넣는다
   * — 서버는 둘 다 받는다 (better-auth `nonceComparison: "exact-or-sha256"`).
   */
  signIn(options: { nonce: string }): Promise<{ idToken: string }>;
}

export type NativeSignInResult =
  | { status: "ok"; idToken: { token: string; nonce: string } }
  | { status: "cancelled" }
  | { status: "failed" };

/** 로그인마다 새로 만드는 nonce (URL-safe, 256비트). */
export function createNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function isCancelled(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === NATIVE_LOGIN_CANCELLED;
}

/**
 * 네이티브 로그인을 시도한다. 이 기기에서 쓸 수 없으면 null (웹 OAuth 로 간다).
 * `loadPlugin` 은 플러그인이 없으면 null 을 돌려준다.
 */
export async function nativeIdTokenSignIn(
  loadPlugin: () => Promise<{ plugin: NativeIdTokenPlugin } | null>,
  nonce: string = createNonce()
): Promise<NativeSignInResult | null> {
  const loaded = await loadPlugin().catch(() => null);
  if (!loaded) return null;
  const { plugin } = loaded;
  const available = await plugin.isAvailable().then(
    (result) => result.available,
    () => false
  );
  if (!available) return null;
  try {
    const { idToken } = await plugin.signIn({ nonce });
    if (!idToken) return { status: "failed" };
    return { status: "ok", idToken: { token: idToken, nonce } };
  } catch (error) {
    return isCancelled(error) ? { status: "cancelled" } : { status: "failed" };
  }
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  isPluginAvailable?: (name: string) => boolean;
}

/**
 * 이 앱에 그 provider 의 네이티브 로그인 플러그인이 있는지 (동기). 앱 셸이 주입한 전역으로 판정한다 —
 * 브라우저는 곧바로 false 라 웹 OAuth 가 지금과 똑같이 시작한다.
 */
export function hasNativeLoginPlugin(provider: SocialProvider): boolean {
  if (typeof window === "undefined") return false;
  const capacitor = (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor;
  return (
    capacitor?.isNativePlatform?.() === true &&
    capacitor.isPluginAvailable?.(NATIVE_LOGIN_PLUGINS[provider]) === true
  );
}

/**
 * 이 기기에서 그 수단으로 로그인(연결)할 수 있는지. 번들 앱은 웹 OAuth 를 쓸 수 없다 — 제공자 화면이
 * 서버 주소로 돌아와 앱 번들을 떠난다. 그래서 네이티브 플러그인이 있는 수단만 보인다 (Android 의 Apple 은
 * 숨는다). 브라우저·옛 앱 셸은 웹 OAuth 로 모두 된다.
 */
export function canSignInWith(provider: SocialProvider): boolean {
  return !isBundledApp() || hasNativeLoginPlugin(provider);
}

/** 이 기기의 네이티브 카카오·Apple 로그인. 쓸 수 없으면 null. */
export function signInNatively(provider: SocialProvider): Promise<NativeSignInResult | null> {
  return nativeIdTokenSignIn(async () => {
    if (!hasNativeLoginPlugin(provider)) return null;
    const { registerPlugin } = await import("@capacitor/core");
    // 플러그인 Proxy 는 `.then` 도 네이티브 호출로 바꾼다 — 객체로 감싸 thenable 로 취급되지 않게 한다.
    return { plugin: registerPlugin<NativeIdTokenPlugin>(NATIVE_LOGIN_PLUGINS[provider]) };
  });
}
