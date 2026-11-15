import { describe, expect, it } from "vitest";
import {
  APP_LOCK_GRACE_MS,
  isAppLockEnabled,
  setAppLockEnabled,
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
