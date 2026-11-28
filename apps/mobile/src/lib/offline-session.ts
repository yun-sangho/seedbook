import { type DeviceStorage, getDeviceStorage } from "./device-storage";
import { nativeSessionToken, type SessionTokenStore } from "./native/session-token";

/**
 * 오프라인 시작 (네이티브 앱). 앱은 화면을 기기에 갖고 있으므로, 서버가 답하지 않아도 마지막으로 확인한
 * 로그인으로 계정 자리를 열어 기기 데이터를 보여 준다 (`lib/auth-client.ts` `useSession`).
 *
 * - 기기에 두는 것: 마지막으로 확인한 세션의 사용자와 세션 시각. 세션 토큰은 두지 않는다 — 토큰은
 *   Keychain/Keystore 에만 있다 (`native/session-token.ts`). 토큰이 없으면 기억한 세션도 쓰지 않는다.
 * - 세션 확인이 **네트워크 오류·5xx** 로 실패하면 기억한 세션으로 연다 (앱 잠금이 지킨다).
 * - 서버가 **세션이 없다고 답하면** (401, 또는 세션 없음) 잊고 로그인 화면으로 간다.
 * - 브라우저(모바일 웹)와 토큰 저장소가 없는 구버전 앱은 쓰지 않는다 — 지금처럼 서버 확인을 기다린다.
 */
export const OFFLINE_SESSION_KEY = "seedbook.lastSession";

export interface RememberedSession {
  user: { id: string } & Record<string, unknown>;
  session: { userId: string; createdAt: string | null; expiresAt: string | null };
}

/** better-auth `useSession()` 의 상태 (쓰는 필드만). */
export interface SessionQueryState {
  data: { user?: unknown; session?: unknown } | null;
  isPending: boolean;
  error: { status?: number } | null;
  [key: string]: unknown;
}

/** `undefined`: 아직 읽는 중, `null`: 기억한 세션 없음. */
export type RememberedSnapshot = RememberedSession | null | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function dateText(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  return typeof value === "string" ? value : null;
}

/** 세션 응답에서 기억할 것만 꺼낸다 (토큰·IP·UA 는 버린다). 사용자가 없으면 null. */
export function toRememberedSession(data: SessionQueryState["data"]): RememberedSession | null {
  const user = data?.user;
  if (!isRecord(user) || typeof user.id !== "string" || !user.id) return null;
  const session = isRecord(data?.session) ? data.session : {};
  return {
    user: { ...user, id: user.id },
    session: {
      userId: user.id,
      createdAt: dateText(session.createdAt),
      expiresAt: dateText(session.expiresAt),
    },
  };
}

function parseRemembered(raw: string | null): RememberedSession | null {
  if (raw === null) return null;
  try {
    return toRememberedSession(JSON.parse(raw) as SessionQueryState["data"]);
  } catch {
    return null;
  }
}

export type SessionAction = "remember" | "forget" | null;

/**
 * 서버 확인 상태와 기억한 세션으로 화면이 쓸 세션을 정한다.
 * - 서버가 사용자를 주면 그대로 (기억한다).
 * - 확인 중이거나 네트워크 오류·5xx 면 기억한 세션 (기억을 읽는 중이면 확인 중으로 둔다).
 * - 서버가 세션이 없다고 답하면 (401, 또는 오류 없이 빈 세션) 그대로 (잊는다).
 */
export function resolveSession<T extends SessionQueryState>(
  real: T,
  remembered: RememberedSnapshot,
  enabled: boolean
): { state: T; action: SessionAction } {
  if (!enabled) return { state: real, action: null };
  if (real.data && toRememberedSession(real.data)) return { state: real, action: "remember" };

  const unauthorized = real.error?.status === 401;
  const serverSaysSignedOut = !real.isPending && (unauthorized || real.error === null);
  if (serverSaysSignedOut) return { state: real, action: "forget" };

  // 확인 중이거나, 서버에 닿지 못했다 (네트워크 오류·5xx).
  if (remembered === undefined) return { state: { ...real, isPending: true }, action: null };
  if (remembered === null) return { state: real, action: null };
  return {
    state: { ...real, data: remembered, isPending: false, error: real.error },
    action: null,
  };
}

export interface OfflineSession {
  enabled(): boolean;
  /** 기억한 세션. 처음 부르면 읽기를 시작한다. */
  get(): RememberedSnapshot;
  subscribe(listener: () => void): () => void;
  remember(data: SessionQueryState["data"]): Promise<void>;
  forget(): Promise<void>;
  /** 로그아웃: 기억한 세션과 토큰을 지금 상태와 상관없이 지운다 (`lib/sign-out.ts`). */
  clear(): Promise<void>;
}

export function createOfflineSession({
  tokens,
  storage,
}: {
  tokens: SessionTokenStore;
  storage: () => DeviceStorage;
}): OfflineSession {
  let snapshot: RememberedSnapshot;
  let loading: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  const publish = (next: RememberedSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  const ready = async () => {
    const device = storage();
    if (!device.isReady()) await device.whenReady();
    return device;
  };

  const load = () => {
    loading ??= (async () => {
      const device = await ready();
      const remembered = parseRemembered(device.getItem(OFFLINE_SESSION_KEY));
      // 토큰이 없으면 (로그아웃했거나 키체인이 비었다) 서버도 이 세션을 받지 않는다.
      const token = remembered ? await tokens.read() : null;
      // 읽는 동안 서버 확인이 먼저 끝났으면 그 결과가 이긴다.
      if (snapshot === undefined) publish(remembered && token ? remembered : null);
    })().catch(() => {
      if (snapshot === undefined) publish(null);
    });
    return loading;
  };

  const clear = async () => {
    publish(null);
    // 서버가 받지 않는 토큰을 계속 보내지 않는다.
    if (tokens.enabled()) await tokens.clear();
    const device = await ready();
    device.removeItem(OFFLINE_SESSION_KEY);
  };

  return {
    enabled: () => tokens.enabled(),
    get() {
      if (snapshot === undefined && tokens.enabled()) void load();
      return snapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async remember(data) {
      const next = toRememberedSession(data);
      if (!next) return;
      const text = JSON.stringify(next);
      if (snapshot && JSON.stringify(snapshot) === text) return;
      publish(next);
      const device = await ready();
      if (device.getItem(OFFLINE_SESSION_KEY) !== text) device.setItem(OFFLINE_SESSION_KEY, text);
    },
    async forget() {
      if (snapshot === null) return;
      await clear();
    },
    clear,
  };
}

export const offlineSession: OfflineSession = createOfflineSession({
  tokens: nativeSessionToken,
  storage: getDeviceStorage,
});
