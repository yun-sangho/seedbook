import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// DB 는 경계라 mock 한다. 세션 보장 함수만 대체하고 상수는 실제 값을 쓴다.
const ensureDevAuth = vi.fn<() => Promise<void>>();
vi.mock("@seedbook/database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@seedbook/database")>();
  return { ...actual, ensureDevAuth };
});

// route 는 NODE_ENV 를 모듈 로드 시점에 읽으므로 env 를 바꾼 뒤 새로 import 한다.
async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

describe("POST /api/auth/dev-login", () => {
  beforeEach(() => {
    ensureDevAuth.mockReset();
    ensureDevAuth.mockResolvedValue(undefined);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("recreates the dev user and session before handing out the cookie", async () => {
    const { POST } = await loadRoute();

    const res = await POST();

    expect(ensureDevAuth).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(204);
    expect(res.headers.get("Set-Cookie")).toContain(
      "better-auth.session_token=dev-session-token-v1."
    );
  });

  it("returns 500 without a cookie when the dev session cannot be ensured", async () => {
    ensureDevAuth.mockRejectedValue(new Error("connection refused"));
    const { POST } = await loadRoute();

    const res = await POST();

    expect(res.status).toBe(500);
    expect(res.headers.get("Set-Cookie")).toBeNull();
  });

  it("is a 404 outside development and never touches the DB", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { POST } = await loadRoute();

    const res = await POST();

    expect(res.status).toBe(404);
    expect(ensureDevAuth).not.toHaveBeenCalled();
  });
});
