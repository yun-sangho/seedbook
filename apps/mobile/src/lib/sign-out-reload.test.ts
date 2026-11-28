import { afterEach, describe, expect, it, vi } from "vitest";

const restartAppAt = vi.fn(async (_path: string) => undefined);
const bundled = vi.hoisted(() => ({ value: false }));

vi.mock("./device-storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./device-storage")>()),
  restartAppAt: (path: string) => restartAppAt(path),
}));

vi.mock("./native/bundled-app", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./native/bundled-app")>()),
  isBundledApp: () => bundled.value,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  restartAppAt.mockClear();
  bundled.value = false;
});

function stubServerOk() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 200 }))
  );
}

describe("signOutAndReload", () => {
  it("goes to the login screen even when the sign-out request fails (server off)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Load failed");
      })
    );
    const { signOutAndReload } = await import("./sign-out");

    await signOutAndReload();

    expect(restartAppAt).toHaveBeenCalledTimes(1);
  });

  it("marks the sign-out so the login screen does not prompt Face ID right away", async () => {
    stubServerOk();
    const { signOutAndReload } = await import("./sign-out");

    await signOutAndReload();

    expect(window.sessionStorage.getItem("seedbook.signed-out")).toBe("1");
  });

  it("starts the web app over at home, not the screen it signed out from", async () => {
    stubServerOk();
    window.history.replaceState(null, "", "/settings");
    const { signOutAndReload } = await import("./sign-out");

    await signOutAndReload();

    expect(restartAppAt).toHaveBeenCalledWith("/home");
  });

  it("starts the bundled app over at its shell root", async () => {
    stubServerOk();
    bundled.value = true;
    window.history.replaceState(null, "", "/settings/login-methods");
    const { signOutAndReload } = await import("./sign-out");

    await signOutAndReload();

    expect(restartAppAt).toHaveBeenCalledWith("/");
  });
});
