import { describe, expect, it } from "vitest";
import { GET } from "./route";

const get = (query: string) => GET(new Request(`http://localhost/api/app-bundle/latest?${query}`));

describe("GET /api/app-bundle/latest", () => {
  it("answers 'nothing to get' to an app that does not send its binary version", async () => {
    const response = await get("channel=production");

    expect(await response.json()).toEqual({ bundle: null, reset: false });
  });

  it("answers 'nothing to get' for an unknown channel", async () => {
    const response = await get("native=1.0.0&channel=nightly");

    expect(await response.json()).toEqual({ bundle: null, reset: false });
  });

  it("is not cached (a halted bundle must stop being offered right away)", async () => {
    const response = await get("channel=production");

    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
