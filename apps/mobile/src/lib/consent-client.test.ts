import { describe, expect, it, vi } from "vitest";
import { CONSENT_AGREED_KEY, type ConsentStatus, withRememberedConsent } from "./consent-client";

vi.mock("@mobile/lib/auth-client", () => ({ authClient: {} }));

function memory(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

const failed: ConsentStatus = { kind: "failed" };

describe("withRememberedConsent", () => {
  it("opens the app offline for an account the server last saw as agreed", () => {
    const storage = memory({ [CONSENT_AGREED_KEY]: "1" });

    expect(withRememberedConsent(failed, true, storage)).toEqual({ kind: "agreed", notices: [] });
  });

  it("keeps the retry screen offline when this account never agreed on this device", () => {
    expect(withRememberedConsent(failed, true, memory())).toBe(failed);
  });

  it("remembers an agreement the server confirmed", () => {
    const storage = memory();

    withRememberedConsent({ kind: "agreed", notices: [] }, true, storage);

    expect(storage.values.get(CONSENT_AGREED_KEY)).toBe("1");
  });

  it("forgets the agreement when the server asks for consent again (revised terms)", () => {
    const storage = memory({ [CONSENT_AGREED_KEY]: "1" });

    withRememberedConsent({ kind: "required", newSignUp: false, documents: [] }, true, storage);

    expect(storage.values.has(CONSENT_AGREED_KEY)).toBe(false);
  });

  it("leaves the browser unchanged — a failed check is never treated as agreed", () => {
    const storage = memory({ [CONSENT_AGREED_KEY]: "1" });

    expect(withRememberedConsent(failed, false, storage)).toBe(failed);
  });
});
