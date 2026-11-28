import { describe, expect, it, vi } from "vitest";
import type { DeviceStorage } from "./device-storage";
import type { SessionQueryState } from "./offline-session";
import { createPendingSignOut, maskPendingSignOut, PENDING_SIGN_OUT_KEY } from "./pending-sign-out";

function query(state: Partial<SessionQueryState>): SessionQueryState {
  return { data: null, isPending: false, error: null, ...state };
}

const signedIn = (sessionId: string) => ({
  user: { id: "u-1" },
  session: { id: sessionId, userId: "u-1" },
});

describe("maskPendingSignOut", () => {
  it("passes the server's answer through when nothing is pending", () => {
    const real = query({ data: signedIn("s-1") });

    expect(maskPendingSignOut(real, null)).toEqual({ state: real, action: null });
  });

  it("treats the session the sign-out could not end as signed out and retries", () => {
    const { state, action } = maskPendingSignOut(query({ data: signedIn("s-1") }), "s-1");

    expect(state.data).toBeNull();
    expect(state.isPending).toBe(false);
    expect(action).toBe("retry");
  });

  it("keeps a new sign-in and drops the mark", () => {
    const real = query({ data: signedIn("s-2") });

    expect(maskPendingSignOut(real, "s-1")).toEqual({ state: real, action: "clear" });
  });

  it("waits while the mark is still being read instead of showing the app", () => {
    const { state } = maskPendingSignOut(query({ data: signedIn("s-1") }), undefined);

    expect(state.isPending).toBe(true);
  });

  it("drops the mark once the server answers there is no session", () => {
    const real = query({ data: null, error: null });

    expect(maskPendingSignOut(real, "s-1")).toEqual({ state: real, action: "clear" });
  });

  it("drops the mark when the server answers 401", () => {
    const real = query({ error: { status: 401 } });

    expect(maskPendingSignOut(real, "s-1")).toEqual({ state: real, action: "clear" });
  });

  it("keeps the mark while the server cannot be reached", () => {
    const real = query({ error: { status: undefined } });

    expect(maskPendingSignOut(real, "s-1")).toEqual({ state: real, action: null });
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

describe("createPendingSignOut", () => {
  it("reads the mark left on this device", async () => {
    const pending = createPendingSignOut(() => memoryDevice({ [PENDING_SIGN_OUT_KEY]: "s-1" }));

    pending.get();
    await vi.waitFor(() => expect(pending.get()).toBe("s-1"));
  });

  it("reads no mark as null", async () => {
    const pending = createPendingSignOut(() => memoryDevice());

    pending.get();
    await vi.waitFor(() => expect(pending.get()).toBeNull());
  });

  it("stores and clears the mark", async () => {
    const device = memoryDevice();
    const pending = createPendingSignOut(() => device);

    await pending.set("s-1");
    expect(device.getItem(PENDING_SIGN_OUT_KEY)).toBe("s-1");

    await pending.clear();
    expect(device.getItem(PENDING_SIGN_OUT_KEY)).toBeNull();
    expect(pending.get()).toBeNull();
  });
});
