/**
 * 네이티브 앱의 로그인 세션 토큰 (better-auth `bearer()`). 앱 번들은 서버와 origin 이 달라 쿠키 세션을
 * 쓸 수 없으므로 로그인 응답의 `set-auth-token` 을 받아 두었다가 `Authorization: Bearer` 로 보낸다
 * (`lib/api-client.ts` `createAuthorizedFetch`).
 *
 * - 토큰은 Keychain (iOS, 이 기기에서만·첫 잠금 해제 뒤) / Keystore 로 암호화한 저장소 (Android) 에만 둔다
 *   (`SeedbookSecureStorage`, `packages/native-plugins`). 생체 인증 로그인의 금고
 *   (`biometric-login.ts`) 와 달리 꺼낼 때 프롬프트가 없다 — 요청마다 읽기 때문이다. 기기 저장소
 *   (SQLite)·localStorage 에는 두지 않는다.
 * - 브라우저(모바일 웹)와 플러그인이 없는 구버전 앱은 토큰이 없다 — 지금처럼 쿠키 세션만 쓴다.
 * - 한 번 읽은 값은 메모리에 두고, 저장·삭제는 메모리를 먼저 바꾼다.
 */

export const SECURE_STORAGE_PLUGIN = "SeedbookSecureStorage";
export const SESSION_TOKEN_KEY = "session-token";

export interface SecureStoragePlugin {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<unknown>;
  remove(options: { key: string }): Promise<unknown>;
}

export interface SessionTokenStore {
  /** 이 기기에서 토큰을 쓰는지 (동기). false 면 요청을 손대지 않는다 — 브라우저는 지금과 똑같다. */
  enabled(): boolean;
  read(): Promise<string | null>;
  save(token: string): Promise<void>;
  clear(): Promise<void>;
}

/** `isAvailable` 이 false 거나 `loadPlugin` 이 null 이면 (브라우저·구버전 앱) 토큰을 쓰지 않는 저장소. */
export function createSessionTokenStore(
  loadPlugin: () => Promise<{ plugin: SecureStoragePlugin } | null>,
  isAvailable: () => boolean = () => true
): SessionTokenStore {
  // 플러그인 Proxy 를 promise 값으로 돌려주면 `.then` 을 찾다가 네이티브 호출이 되어 영원히 끝나지 않는다 —
  // promise 에는 감싼 객체를 담고, 쓸 때 꺼낸다.
  let pluginPromise: Promise<{ plugin: SecureStoragePlugin } | null> | null = null;
  let cached: Promise<string | null> | null = null;

  const loaded = () => {
    pluginPromise ??= loadPlugin().catch(() => null);
    return pluginPromise;
  };

  return {
    enabled: isAvailable,
    read() {
      cached ??= loaded().then(async (storage) => {
        if (!storage) return null;
        try {
          const { value } = await storage.plugin.get({ key: SESSION_TOKEN_KEY });
          return value || null;
        } catch {
          return null;
        }
      });
      return cached;
    },
    async save(token) {
      const storage = await loaded();
      if (!storage) return;
      cached = Promise.resolve(token);
      // 저장에 실패해도 이번 실행 동안은 메모리 값으로 동작한다. 다음 실행에서 다시 로그인한다.
      await storage.plugin.set({ key: SESSION_TOKEN_KEY, value: token }).catch(() => {});
    },
    async clear() {
      const storage = await loaded();
      cached = Promise.resolve(null);
      if (!storage) return;
      await storage.plugin.remove({ key: SESSION_TOKEN_KEY }).catch(() => {});
    },
  };
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  isPluginAvailable?: (name: string) => boolean;
}

/** 앱 셸이 주입한 전역으로 판정한다 — 브라우저에서는 `@capacitor/core` 를 불러오지 않는다. */
function isSecureStorageAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const capacitor = (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor;
  return (
    capacitor?.isNativePlatform?.() === true &&
    capacitor.isPluginAvailable?.(SECURE_STORAGE_PLUGIN) === true
  );
}

export const nativeSessionToken: SessionTokenStore = createSessionTokenStore(async () => {
  if (!isSecureStorageAvailable()) return null;
  const { registerPlugin } = await import("@capacitor/core");
  // 플러그인 Proxy 는 `.then` 도 네이티브 호출로 바꾼다 — 객체로 감싸 thenable 로 취급되지 않게 한다.
  return { plugin: registerPlugin<SecureStoragePlugin>(SECURE_STORAGE_PLUGIN) };
}, isSecureStorageAvailable);
