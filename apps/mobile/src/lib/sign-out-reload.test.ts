import { afterEach, describe, expect, it, vi } from "vitest";

const reloadApp = vi.fn(async () => undefined);

vi.mock("./device-storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./device-storage")>()),
  reloadApp: () => reloadApp(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  reloadApp.mockClear();
});

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

    expect(reloadApp).toHaveBeenCalledTimes(1);
  });

  it("marks the sign-out so the login screen does not prompt Face ID right away", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 }))
    );
    const { signOutAndReload } = await import("./sign-out");

    await signOutAndReload();

    expect(window.sessionStorage.getItem("seedbook.signed-out")).toBe("1");
  });
});
