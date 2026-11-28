import { afterEach, describe, expect, it, vi } from "vitest";
import { restartAppAt } from "./device-storage";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("restartAppAt", () => {
  it("replaces the current history entry so back does not return to the old screen", async () => {
    const replace = vi.fn();
    vi.stubGlobal("location", { ...window.location, replace });

    await restartAppAt("/home");

    expect(replace).toHaveBeenCalledWith("/home");
  });
});
