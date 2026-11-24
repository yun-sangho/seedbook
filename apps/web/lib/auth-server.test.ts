import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@web/lib/auth", () => ({ auth: { api: { getSession } } }));

const { resolveUserId } = await import("./auth-server");

const request = (account?: string) =>
  new Request("http://localhost/api", {
    headers: account ? { "x-seedbook-account": account } : {},
  });

describe("resolveUserId", () => {
  beforeEach(() => getSession.mockReset().mockResolvedValue({ user: { id: "user-b" } }));

  it("returns the session user when the request does not say whose it is", async () => {
    expect(await resolveUserId(request())).toBe("user-b");
  });

  it("returns the session user when the request is for that account", async () => {
    expect(await resolveUserId(request("user-b"))).toBe("user-b");
  });

  it("refuses a request a stale tab made for the previous account", async () => {
    expect(await resolveUserId(request("user-a"))).toBeNull();
  });

  it("returns null without a session", async () => {
    getSession.mockResolvedValue(null);

    expect(await resolveUserId(request("user-a"))).toBeNull();
  });
});
