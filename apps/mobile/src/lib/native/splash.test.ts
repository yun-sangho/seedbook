import { describe, expect, it, vi } from "vitest";
import { createSplashHider, SPLASH_FADE_OUT_MS } from "./splash";

describe("createSplashHider", () => {
  it("hides the native splash with a short fade when the first screen is ready", async () => {
    const hide = vi.fn(async () => {});
    const hideSplash = createSplashHider({ available: () => true, hide });

    await hideSplash();

    expect(hide).toHaveBeenCalledWith({ fadeOutDuration: SPLASH_FADE_OUT_MS });
  });

  it("hides only once even when several screens report ready", async () => {
    const hide = vi.fn(async () => {});
    const hideSplash = createSplashHider({ available: () => true, hide });

    await Promise.all([hideSplash(), hideSplash()]);
    await hideSplash();

    expect(hide).toHaveBeenCalledTimes(1);
  });

  it("does nothing on the web or an older binary without the plugin", async () => {
    const hide = vi.fn(async () => {});
    const hideSplash = createSplashHider({ available: () => false, hide });

    await hideSplash();

    expect(hide).not.toHaveBeenCalled();
  });

  it("swallows a plugin failure — the splash also hides by itself", async () => {
    const hide = vi.fn(async () => {
      throw new Error("not implemented");
    });
    const hideSplash = createSplashHider({ available: () => true, hide });

    await expect(hideSplash()).resolves.toBeUndefined();
  });
});
