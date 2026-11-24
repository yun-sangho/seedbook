import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, hasRequiredConsents } = vi.hoisted(() => ({
  getSession: vi.fn(),
  hasRequiredConsents: vi.fn(),
}));
vi.mock("@seedbook/database", () => ({ db: {} }));
vi.mock("@web/server/consents/consents", () => ({ hasRequiredConsents }));
vi.mock("@web/lib/auth", () => ({ auth: { api: { getSession } } }));

const { resolveSessionUserId, resolveUserId } = await import("./auth-server");

const request = (account?: string) =>
  new Request("http://localhost/api", {
    headers: account ? { "x-seedbook-account": account } : {},
  });

describe("resolveUserId", () => {
  beforeEach(() => {
    getSession.mockReset().mockResolvedValue({ user: { id: "user-b" } });
    hasRequiredConsents.mockReset().mockResolvedValue(true);
  });

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

  it("refuses a user who has not agreed to the current documents", async () => {
    hasRequiredConsents.mockResolvedValue(false);

    expect(await resolveUserId(request())).toBeNull();
  });

  it("identifies that user for the consent API itself", async () => {
    hasRequiredConsents.mockResolvedValue(false);

    expect(await resolveSessionUserId(request())).toBe("user-b");
  });

  it("refuses a stale tab on the consent API too", async () => {
    expect(await resolveSessionUserId(request("user-a"))).toBeNull();
  });
});
