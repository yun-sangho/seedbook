import { describe, expect, it, vi } from "vitest";
import type { DeviceStorage } from "./device-storage";
import type { SessionTokenStore } from "./native/session-token";
import {
  createOfflineSession,
  OFFLINE_SESSION_KEY,
  type RememberedSession,
  resolveSession,
  type SessionQueryState,
} from "./offline-session";

const signedIn = {
  user: { id: "u-1", name: "씨앗" },
  session: { token: "secret-token", createdAt: "2026-11-01T00:00:00.000Z", expiresAt: null },
};

const remembered: RememberedSession = {
  user: { id: "u-1", name: "씨앗" },
  session: { userId: "u-1", createdAt: "2026-11-01T00:00:00.000Z", expiresAt: null },
};

function query(state: Partial<SessionQueryState>): SessionQueryState {
  return { data: null, isPending: false, error: null, ...state };
}

describe("resolveSession", () => {
  it("passes the server's answer through untouched in the browser", () => {
    const real = query({ error: { status: 503 } });

    expect(resolveSession(real, remembered, false)).toEqual({ state: real, action: null });
  });

  it("remembers a session the server confirmed", () => {
    const real = query({ data: signedIn });

    expect(resolveSession(real, null, true)).toEqual({ state: real, action: "remember" });
  });

  it("opens the remembered session while the server check is still running", () => {
    const { state } = resolveSession(query({ isPending: true }), remembered, true);

    expect(state.data).toBe(remembered);
    expect(state.isPending).toBe(false);
  });

  it("opens the remembered session when the server cannot be reached (offline)", () => {
    const real = query({ error: { status: undefined } });

    const { state, action } = resolveSession(real, remembered, true);

    expect(state.data).toBe(remembered);
    expect(action).toBeNull();
  });

  it("keeps the remembered session on a server error (5xx)", () => {
    const { state } = resolveSession(query({ error: { status: 502 } }), remembered, true);

    expect(state.data).toBe(remembered);
  });

  it("closes the session and forgets it when the server answers 401", () => {
    const real = query({ error: { status: 401 } });

    expect(resolveSession(real, remembered, true)).toEqual({ state: real, action: "forget" });
  });

  it("closes the session when the server answers that there is no session", () => {
    const real = query({ data: null, error: null });

    expect(resolveSession(real, remembered, true)).toEqual({ state: real, action: "forget" });
  });

  it("keeps waiting while the remembered session is still being read", () => {
    const { state } = resolveSession(query({ error: { status: 502 } }), undefined, true);

    expect(state.isPending).toBe(true);
  });

  it("shows the login screen offline when nothing was remembered", () => {
    const real = query({ error: { status: undefined } });

    expect(resolveSession(real, null, true).state).toBe(real);
  });
});

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

function tokenStore(token: string | null): SessionTokenStore {
  return {
    enabled: () => true,
    read: vi.fn(async () => token),
    save: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
  };
}

async function loaded(offline: ReturnType<typeof createOfflineSession>) {
  offline.get();
  await vi.waitFor(() => expect(offline.get()).not.toBeUndefined());
  return offline.get();
}

describe("createOfflineSession", () => {
  it("reads the session remembered on this device", async () => {
    const device = memoryDevice({ [OFFLINE_SESSION_KEY]: JSON.stringify(remembered) });
    const offline = createOfflineSession({ tokens: tokenStore("tok"), storage: () => device });

    expect(await loaded(offline)).toEqual(remembered);
  });

  it("does not use the remembered session without a session token (signed out)", async () => {
    const device = memoryDevice({ [OFFLINE_SESSION_KEY]: JSON.stringify(remembered) });
    const offline = createOfflineSession({ tokens: tokenStore(null), storage: () => device });

    expect(await loaded(offline)).toBeNull();
  });

  it("does not keep the session token on the device", async () => {
    const device = memoryDevice();
    const offline = createOfflineSession({ tokens: tokenStore("tok"), storage: () => device });

    await offline.remember(signedIn);

    const stored = device.getItem(OFFLINE_SESSION_KEY) ?? "";
    expect(stored).not.toContain("secret-token");
    expect(JSON.parse(stored)).toEqual(remembered);
  });

  it("forgets the session and drops the token the server no longer accepts", async () => {
    const device = memoryDevice({ [OFFLINE_SESSION_KEY]: JSON.stringify(remembered) });
    const tokens = tokenStore("tok");
    const offline = createOfflineSession({ tokens, storage: () => device });
    await loaded(offline);

    await offline.forget();

    expect(offline.get()).toBeNull();
    expect(device.getItem(OFFLINE_SESSION_KEY)).toBeNull();
    expect(tokens.clear).toHaveBeenCalled();
  });

  it("ignores a damaged remembered value", async () => {
    const device = memoryDevice({ [OFFLINE_SESSION_KEY]: "{not json" });
    const offline = createOfflineSession({ tokens: tokenStore("tok"), storage: () => device });

    expect(await loaded(offline)).toBeNull();
  });
});
