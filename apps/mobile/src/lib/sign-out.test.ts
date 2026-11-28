import { afterEach, describe, expect, it, vi } from "vitest";
import type { DeviceStorage } from "./device-storage";
import type { SessionTokenStore } from "./native/session-token";
import { createOfflineSession, OFFLINE_SESSION_KEY } from "./offline-session";
import { createPendingSignOut, PENDING_SIGN_OUT_KEY } from "./pending-sign-out";
import { createSignOut } from "./sign-out";

const remembered = {
  user: { id: "u-1", name: "씨앗" },
  session: { userId: "u-1", createdAt: "2026-11-01T00:00:00.000Z", expiresAt: null },
};

function memoryDevice(initial: Record<string, string> = {}): DeviceStorage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    isReady: () => true,
    whenReady: async () => undefined,
  } as Partial<DeviceStorage> as DeviceStorage;
}

/** Keychain 처럼 지우면 다음 읽기에서 없는 토큰 저장소. */
function keychain(initial: string | null): SessionTokenStore {
  let token = initial;
  return {
    enabled: () => true,
    read: async () => token,
    save: async (next) => {
      token = next;
    },
    clear: async () => {
      token = null;
    },
  };
}

/** 앱을 다시 켰을 때(새로고침) 기억한 세션으로 계정을 여는지. */
async function sessionAfterReload(device: DeviceStorage, tokens: SessionTokenStore) {
  const offline = createOfflineSession({ tokens, storage: () => device });
  offline.get();
  await vi.waitFor(() => expect(offline.get()).not.toBeUndefined());
  return offline.get();
}

/** 브라우저: 토큰 저장소가 없다 (쿠키 세션). */
const browserTokens: SessionTokenStore = {
  enabled: () => false,
  read: async () => null,
  save: async () => undefined,
  clear: async () => undefined,
};

function signedInApp() {
  const device = memoryDevice({ [OFFLINE_SESSION_KEY]: JSON.stringify(remembered) });
  const tokens = keychain("tok");
  const offline = createOfflineSession({ tokens, storage: () => device });
  const pending = createPendingSignOut(() => device);
  return { device, tokens, offline, pending };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createSignOut (device-first sign-out)", () => {
  it("signs the app out when the server cannot be reached (offline, dev server off)", async () => {
    const { device, tokens, offline, pending } = signedInApp();
    const signOut = createSignOut({
      requestSignOut: () => Promise.reject(new TypeError("Load failed")),
      sessionId: () => "s-1",
      tokens,
      offline,
      pending,
    });

    await signOut();

    expect(await tokens.read()).toBeNull();
    expect(device.getItem(OFFLINE_SESSION_KEY)).toBeNull();
    expect(await sessionAfterReload(device, tokens)).toBeNull();
  });

  it("signs the app out when the server answers with an error (5xx)", async () => {
    const { device, tokens, offline, pending } = signedInApp();
    const signOut = createSignOut({
      requestSignOut: async () => false,
      sessionId: () => "s-1",
      tokens,
      offline,
      pending,
    });

    await signOut();

    expect(await sessionAfterReload(device, tokens)).toBeNull();
  });

  it("does not wait for a server that never answers", async () => {
    vi.useFakeTimers();
    const { device, tokens, offline, pending } = signedInApp();
    const signOut = createSignOut({
      requestSignOut: () => new Promise<boolean>(() => undefined),
      sessionId: () => "s-1",
      tokens,
      offline,
      pending,
      timeoutMs: 4_000,
    });

    const done = signOut();
    await vi.advanceTimersByTimeAsync(4_000);
    await done;

    expect(await tokens.read()).toBeNull();
    expect(device.getItem(OFFLINE_SESSION_KEY)).toBeNull();
  });

  it("sends the sign-out before dropping the token the server needs to find the session", async () => {
    const { tokens, offline, pending } = signedInApp();
    let tokenDuringRequest: string | null = null;
    const signOut = createSignOut({
      requestSignOut: async () => {
        tokenDuringRequest = await tokens.read();
        return true;
      },
      sessionId: () => "s-1",
      tokens,
      offline,
      pending,
    });

    await signOut();

    expect(tokenDuringRequest).toBe("tok");
  });

  it("remembers the cookie session the server did not end, to hide it next time (browser)", async () => {
    const { device, offline, pending } = signedInApp();
    const signOut = createSignOut({
      requestSignOut: async () => false,
      sessionId: () => "s-1",
      tokens: browserTokens,
      offline,
      pending,
    });

    await signOut();

    expect(device.getItem(PENDING_SIGN_OUT_KEY)).toBe("s-1");
  });

  it("leaves no mark in the app — the deleted token already ends the session there", async () => {
    // 개발용 빠른 로그인은 늘 같은 세션 id 를 쓴다 — 표시가 남으면 다시 로그인해도 가려진다.
    const { device, tokens, offline, pending } = signedInApp();
    const signOut = createSignOut({
      requestSignOut: async () => false,
      sessionId: () => "s-1",
      tokens,
      offline,
      pending,
    });

    await signOut();

    expect(device.getItem(PENDING_SIGN_OUT_KEY)).toBeNull();
  });

  it("leaves nothing pending when the server ended the session", async () => {
    const { device, tokens, offline, pending } = signedInApp();
    device.setItem(PENDING_SIGN_OUT_KEY, "old");
    pending.get();
    const signOut = createSignOut({
      requestSignOut: async () => true,
      sessionId: () => "s-1",
      tokens,
      offline,
      pending,
    });

    await signOut();

    expect(device.getItem(PENDING_SIGN_OUT_KEY)).toBeNull();
  });

  it("clears the remembered session even when it was never read this run", async () => {
    // 오프라인 세션을 아직 읽지 않았거나 null 로 읽었어도 (forget 은 건너뛴다) 로그아웃은 지운다.
    const { device, tokens, offline, pending } = signedInApp();
    const signOut = createSignOut({
      requestSignOut: async () => true,
      sessionId: () => null,
      tokens,
      offline,
      pending,
    });

    await signOut();

    expect(device.getItem(OFFLINE_SESSION_KEY)).toBeNull();
    expect(offline.get()).toBeNull();
  });
});
