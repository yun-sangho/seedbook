import { describe, expect, it } from "vitest";
import {
  APP_LOCK_GRACE_MS,
  clearAppLockSeen,
  isAppLockEnabled,
  readAppLockSeen,
  recordAppLockSeen,
  setAppLockEnabled,
  shouldLockOnLaunch,
  shouldLockOnReturn,
} from "./app-lock";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe("app lock setting", () => {
  it("is off until the user turns it on", () => {
    expect(isAppLockEnabled(memoryStorage())).toBe(false);
  });

  it("remembers that the user turned it on", () => {
    const storage = memoryStorage();
    setAppLockEnabled(storage, true);
    expect(isAppLockEnabled(storage)).toBe(true);
  });

  it("turns off again", () => {
    const storage = memoryStorage();
    setAppLockEnabled(storage, true);
    setAppLockEnabled(storage, false);
    expect(isAppLockEnabled(storage)).toBe(false);
  });

  it("treats unreadable storage as off", () => {
    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {},
      removeItem: () => {},
    };
    expect(isAppLockEnabled(broken)).toBe(false);
  });
});

describe("shouldLockOnReturn", () => {
  const hiddenAt = 1_000_000;

  it("locks when the app was in the background longer than the grace period", () => {
    expect(shouldLockOnReturn({ enabled: true, hiddenAt, now: hiddenAt + APP_LOCK_GRACE_MS })).toBe(
      true
    );
  });

  it("stays unlocked after a quick switch to another app (e.g. copying a number)", () => {
    expect(
      shouldLockOnReturn({ enabled: true, hiddenAt, now: hiddenAt + APP_LOCK_GRACE_MS - 1 })
    ).toBe(false);
  });

  it("never locks when the setting is off", () => {
    expect(shouldLockOnReturn({ enabled: false, hiddenAt, now: hiddenAt + 10 * 60_000 })).toBe(
      false
    );
  });

  it("does not lock when the app was never hidden", () => {
    expect(shouldLockOnReturn({ enabled: true, hiddenAt: null, now: hiddenAt })).toBe(false);
  });
});

describe("APP_LOCK_GRACE_MS", () => {
  it("lets the user step away for up to five minutes (2026-11-28 user decision)", () => {
    expect(APP_LOCK_GRACE_MS).toBe(5 * 60_000);
  });
});

describe("app lock last-seen mark (survives page reloads within one app session)", () => {
  it("is absent on a fresh launch", () => {
    expect(readAppLockSeen(memoryStorage())).toBeNull();
  });

  it("remembers when the unlocked app was last on screen", () => {
    const storage = memoryStorage();
    recordAppLockSeen(storage, 1_000);
    expect(readAppLockSeen(storage)).toBe(1_000);
  });

  it("is cleared while the app is locked, so reloading the locked screen keeps it locked", () => {
    const storage = memoryStorage();
    recordAppLockSeen(storage, 1_000);
    clearAppLockSeen(storage);
    expect(readAppLockSeen(storage)).toBeNull();
  });

  it("ignores a malformed value", () => {
    const storage = memoryStorage();
    storage.setItem("seedbook.app-lock.seen-at", "soon");
    expect(readAppLockSeen(storage)).toBeNull();
  });

  it("treats unavailable storage as never seen", () => {
    expect(readAppLockSeen(null)).toBeNull();
    expect(() => recordAppLockSeen(null, 1_000)).not.toThrow();
  });
});

describe("shouldLockOnLaunch", () => {
  const seenAt = 1_000_000;

  it("locks a fresh launch (nothing seen in this app session)", () => {
    expect(shouldLockOnLaunch({ enabled: true, lastSeenAt: null, now: seenAt })).toBe(true);
  });

  it("does not lock again when the page reloads right after being on screen (sign-in, storage mode switch)", () => {
    expect(shouldLockOnLaunch({ enabled: true, lastSeenAt: seenAt, now: seenAt + 2_000 })).toBe(
      false
    );
  });

  it("locks when the web view was reloaded after a long time in the background", () => {
    expect(
      shouldLockOnLaunch({ enabled: true, lastSeenAt: seenAt, now: seenAt + APP_LOCK_GRACE_MS })
    ).toBe(true);
  });

  it("locks when the clock went backwards (the mark cannot be trusted)", () => {
    expect(shouldLockOnLaunch({ enabled: true, lastSeenAt: seenAt, now: seenAt - 1 })).toBe(true);
  });

  it("never locks when the setting is off", () => {
    expect(shouldLockOnLaunch({ enabled: false, lastSeenAt: null, now: seenAt })).toBe(false);
  });
});
