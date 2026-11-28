import { afterEach, describe, expect, it, vi } from "vitest";

/** `NEXT_PUBLIC_API_BASE_URL` 을 정한 채 새로 빌드된 것처럼 모듈을 다시 불러온다. */
async function load(baseUrl: string | undefined) {
  vi.resetModules();
  if (baseUrl === undefined) vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", undefined as unknown as string);
  else vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", baseUrl);
  return import("./api-client");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("apiUrl", () => {
  it("keeps the relative path when no base URL is set (same origin)", async () => {
    const { apiUrl, API_BASE_URL } = await load(undefined);

    expect(API_BASE_URL).toBe("");
    expect(apiUrl("/api/sync/pull?since=1")).toBe("/api/sync/pull?since=1");
  });

  it("prefixes the base URL", async () => {
    const { apiUrl } = await load("https://api.example.com");

    expect(apiUrl("/api/me/preferences")).toBe("https://api.example.com/api/me/preferences");
  });

  it("drops a trailing slash on the base URL", async () => {
    const { apiUrl } = await load("https://api.example.com/");

    expect(apiUrl("/api/legal/terms")).toBe("https://api.example.com/api/legal/terms");
  });
});

describe("apiFetch", () => {
  it("sends the request to the base URL with the given init unchanged", async () => {
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const { apiFetch } = await load("https://api.example.com");
    const init = { method: "POST", credentials: "include" as const, body: "{}" };

    await apiFetch("/api/sync/mutations", init);

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/api/sync/mutations", init);
  });

  it("calls the same-origin path when no base URL is set", async () => {
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const { apiFetch } = await load(undefined);

    await apiFetch("/api/stocks/prices");

    expect(fetchMock).toHaveBeenCalledWith("/api/stocks/prices", undefined);
  });

  it("sends URL objects as they are", async () => {
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const { apiFetch } = await load("https://api.example.com");
    const url = new URL("https://other.example.com/x");

    await apiFetch(url);

    expect(fetchMock).toHaveBeenCalledWith(url, undefined);
  });
});
