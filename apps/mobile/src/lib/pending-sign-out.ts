import { type DeviceStorage, getDeviceStorage } from "./device-storage";
import type { SessionQueryState } from "./offline-session";

/**
 * 서버가 아직 끝내지 못한 로그아웃 (`lib/sign-out.ts`). 로그아웃은 기기 우선이라 서버에 닿지 못해도
 * 로그인 화면으로 간다. 브라우저 쿠키는 앱이 지울 수 없으므로, 끝내지 못한 세션의 id 를 기기에 남겨
 * 그 세션이 다시 보이면 로그인하지 않은 것으로 보고 서버 로그아웃을 다시 보낸다.
 *
 * - 앱(토큰)은 남기지 않는다 — 토큰을 지웠으니 그 세션을 다시 쓸 수 없다.
 * - 사용자가 로그인을 시작하면 지운다 (개발용 빠른 로그인은 늘 같은 세션 id 라 표시가 남으면 가려진다).
 *   새로 로그인해 다른 세션이 보여도 지운다.
 * - 서버가 세션이 없다고 답하거나 다시 보낸 로그아웃이 성공하면 지운다.
 */
export const PENDING_SIGN_OUT_KEY = "seedbook.pendingSignOut";

/** `undefined`: 아직 읽는 중, `null`: 끝내지 못한 로그아웃 없음. */
export type PendingSignOutSnapshot = string | null | undefined;

export interface PendingSignOut {
  get(): PendingSignOutSnapshot;
  subscribe(listener: () => void): () => void;
  set(sessionId: string): Promise<void>;
  clear(): Promise<void>;
}

export function createPendingSignOut(storage: () => DeviceStorage): PendingSignOut {
  let snapshot: PendingSignOutSnapshot;
  let loading: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  const publish = (next: PendingSignOutSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  const ready = async () => {
    const device = storage();
    if (!device.isReady()) await device.whenReady();
    return device;
  };

  const load = () => {
    loading ??= ready()
      .then((device) => {
        if (snapshot === undefined) publish(device.getItem(PENDING_SIGN_OUT_KEY) || null);
      })
      .catch(() => {
        if (snapshot === undefined) publish(null);
      });
    return loading;
  };

  return {
    get() {
      if (snapshot === undefined) void load();
      return snapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async set(sessionId) {
      publish(sessionId);
      (await ready()).setItem(PENDING_SIGN_OUT_KEY, sessionId);
    },
    async clear() {
      if (snapshot === null) return;
      publish(null);
      (await ready()).removeItem(PENDING_SIGN_OUT_KEY);
    },
  };
}

/** better-auth 세션 응답의 세션 id. */
export function sessionIdOf(data: SessionQueryState["data"]): string | null {
  const session = data?.session;
  if (typeof session !== "object" || session === null) return null;
  const id = (session as { id?: unknown }).id;
  return typeof id === "string" && id ? id : null;
}

export type PendingSignOutAction = "retry" | "clear" | null;

/**
 * 끝내지 못한 로그아웃이 있으면 서버 확인 결과를 가린다.
 * - 표시를 읽는 중이고 서버가 사용자를 주면 확인 중으로 둔다 (로그인 화면이 잠깐 앱으로 바뀌지 않게).
 * - 그 세션이면 로그인하지 않은 것으로 보고 서버 로그아웃을 다시 보낸다 (`retry`).
 * - 다른 세션(새 로그인)이면 그대로 두고 표시를 지운다 (`clear`).
 * - 서버가 세션이 없다고 답하면 (401, 또는 오류 없이 빈 세션) 표시를 지운다 (`clear`) — 앱은 토큰을
 *   지웠으므로 여기서 끝난다.
 */
export function maskPendingSignOut<T extends SessionQueryState>(
  real: T,
  pending: PendingSignOutSnapshot
): { state: T; action: PendingSignOutAction } {
  if (pending === null) return { state: real, action: null };
  if (!real.data?.user) {
    const serverSaysSignedOut =
      !real.isPending && (real.error?.status === 401 || real.error === null);
    return { state: real, action: pending !== undefined && serverSaysSignedOut ? "clear" : null };
  }
  if (pending === undefined) return { state: { ...real, isPending: true }, action: null };
  if (sessionIdOf(real.data) !== pending) return { state: real, action: "clear" };
  return { state: { ...real, data: null, error: null, isPending: false }, action: "retry" };
}

export const pendingSignOut: PendingSignOut = createPendingSignOut(getDeviceStorage);
