import { afterEach, describe, expect, it, vi } from "vitest";

/** `SEEDBOOK_API_BASE_URL` 을 정한 채 새로 빌드된 것처럼 모듈을 다시 불러온다. */
async function load(baseUrl: string | undefined) {
  vi.resetModules();
  if (baseUrl === undefined) vi.stubEnv("SEEDBOOK_API_BASE_URL", undefined as unknown as string);
  else vi.stubEnv("SEEDBOOK_API_BASE_URL", baseUrl);
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

describe("createAuthorizedFetch (native app bearer session)", () => {
  function memoryTokens(initial: string | null) {
    let token = initial;
    return {
      enabled: () => true,
      read: vi.fn(async () => token),
      save: vi.fn(async (next: string) => {
        token = next;
      }),
      clear: vi.fn(async () => {
        token = null;
      }),
      current: () => token,
    };
  }

  function sentHeaders(fetchMock: ReturnType<typeof vi.fn>): Headers {
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    return new Headers(init?.headers);
  }

  it("sends the request untouched in the browser (no secure storage)", async () => {
    const { createAuthorizedFetch } = await load(undefined);
    const fetchMock = vi.fn(async () => new Response("{}", { headers: { "set-auth-token": "t" } }));
    const tokens = { ...memoryTokens(null), enabled: () => false };
    const init = { method: "POST", body: "{}" };

    void createAuthorizedFetch(fetchMock, tokens)("/api/sync/v2/push", init);

    // 같은 틱에 보낸다 — 브라우저 동작이 바뀌지 않는다.
    expect(fetchMock).toHaveBeenCalledWith("/api/sync/v2/push", init);
    expect(tokens.read).not.toHaveBeenCalled();
  });

  it("sends the request untouched when the app has no token yet", async () => {
    const { createAuthorizedFetch } = await load(undefined);
    const fetchMock = vi.fn(async () => new Response("{}"));
    const init = { method: "POST", body: "{}" };

    await createAuthorizedFetch(fetchMock, memoryTokens(null))("/api/sync/v2/push", init);

    expect(fetchMock).toHaveBeenCalledWith("/api/sync/v2/push", init);
  });

  it("adds the stored token as a bearer Authorization header, keeping other headers", async () => {
    const { createAuthorizedFetch } = await load(undefined);
    const fetchMock = vi.fn(async () => new Response("{}"));

    await createAuthorizedFetch(fetchMock, memoryTokens("tok.sig"))("/api/me/preferences", {
      headers: { "x-seedbook-account": "user-1" },
    });

    const headers = sentHeaders(fetchMock);
    expect(headers.get("authorization")).toBe("Bearer tok.sig");
    expect(headers.get("x-seedbook-account")).toBe("user-1");
  });

  it("keeps an Authorization header the caller set", async () => {
    const { createAuthorizedFetch } = await load(undefined);
    const fetchMock = vi.fn(async () => new Response("{}"));

    await createAuthorizedFetch(fetchMock, memoryTokens("tok.sig"))("/api/x", {
      headers: { authorization: "Bearer other" },
    });

    expect(sentHeaders(fetchMock).get("authorization")).toBe("Bearer other");
  });

  it("stores the token a sign-in response hands over (account switch replaces it)", async () => {
    const { createAuthorizedFetch } = await load(undefined);
    const tokens = memoryTokens("old-user.sig");
    const fetchMock = vi.fn(
      async () => new Response("{}", { headers: { "set-auth-token": "new-user.sig" } })
    );

    await createAuthorizedFetch(
      fetchMock,
      tokens
    )("https://api.example.com/api/auth/sign-in/social");

    expect(tokens.current()).toBe("new-user.sig");
  });

  it("clears the token after a successful sign-out or account deletion", async () => {
    const { createAuthorizedFetch } = await load(undefined);
    for (const path of ["/api/auth/sign-out", "https://api.example.com/api/auth/delete-user"]) {
      const tokens = memoryTokens("tok.sig");
      const fetchMock = vi.fn(async () => new Response("{}"));

      await createAuthorizedFetch(fetchMock, tokens)(path, { method: "POST" });

      expect(tokens.current()).toBeNull();
    }
  });

  it("keeps the token when sign-out fails (offline, server error)", async () => {
    const { createAuthorizedFetch } = await load(undefined);
    const tokens = memoryTokens("tok.sig");
    const fetchMock = vi.fn(async () => new Response("{}", { status: 500 }));

    await createAuthorizedFetch(fetchMock, tokens)("/api/auth/sign-out", { method: "POST" });

    expect(tokens.current()).toBe("tok.sig");
  });

  it("keeps the token on other responses", async () => {
    const { createAuthorizedFetch } = await load(undefined);
    const tokens = memoryTokens("tok.sig");
    const fetchMock = vi.fn(async () => new Response("{}"));

    await createAuthorizedFetch(fetchMock, tokens)("/api/auth/get-session");

    expect(tokens.save).not.toHaveBeenCalled();
    expect(tokens.clear).not.toHaveBeenCalled();
  });
});
