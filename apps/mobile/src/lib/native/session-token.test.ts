import { describe, expect, it, vi } from "vitest";
import {
  createSessionTokenStore,
  SESSION_TOKEN_KEY,
  type SecureStoragePlugin,
} from "./session-token";

function fakeSecureStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const plugin: SecureStoragePlugin = {
    get: vi.fn(async ({ key }) => ({ value: values.get(key) ?? null })),
    set: vi.fn(async ({ key, value }) => {
      values.set(key, value);
    }),
    remove: vi.fn(async ({ key }) => {
      values.delete(key);
    }),
  };
  return { plugin, values };
}

describe("createSessionTokenStore", () => {
  it("has no token without the native plugin (browser, older app)", async () => {
    const store = createSessionTokenStore(async () => null);

    await store.save("tok.sig");

    expect(await store.read()).toBeNull();
  });

  it("reads the token kept in secure storage", async () => {
    const { plugin } = fakeSecureStorage({ [SESSION_TOKEN_KEY]: "tok.sig" });
    const store = createSessionTokenStore(async () => ({ plugin }));

    expect(await store.read()).toBe("tok.sig");
  });

  it("reads secure storage once and serves later reads from memory", async () => {
    const { plugin } = fakeSecureStorage({ [SESSION_TOKEN_KEY]: "tok.sig" });
    const store = createSessionTokenStore(async () => ({ plugin }));

    await store.read();
    await store.read();

    expect(plugin.get).toHaveBeenCalledTimes(1);
  });

  it("saves to secure storage and serves the new token right away", async () => {
    const { plugin, values } = fakeSecureStorage();
    const store = createSessionTokenStore(async () => ({ plugin }));

    await store.save("new.sig");

    expect(await store.read()).toBe("new.sig");
    expect(values.get(SESSION_TOKEN_KEY)).toBe("new.sig");
  });

  it("clears both memory and secure storage", async () => {
    const { plugin, values } = fakeSecureStorage({ [SESSION_TOKEN_KEY]: "tok.sig" });
    const store = createSessionTokenStore(async () => ({ plugin }));
    await store.read();

    await store.clear();

    expect(await store.read()).toBeNull();
    expect(values.has(SESSION_TOKEN_KEY)).toBe(false);
  });

  it("treats a failing secure storage read as no token", async () => {
    const { plugin } = fakeSecureStorage();
    vi.mocked(plugin.get).mockRejectedValue(new Error("keychain locked"));
    const store = createSessionTokenStore(async () => ({ plugin }));

    expect(await store.read()).toBeNull();
  });

  it("keeps using the token in memory when saving to secure storage fails", async () => {
    const { plugin } = fakeSecureStorage();
    vi.mocked(plugin.set).mockRejectedValue(new Error("disk full"));
    const store = createSessionTokenStore(async () => ({ plugin }));

    await store.save("new.sig");

    expect(await store.read()).toBe("new.sig");
  });
});
