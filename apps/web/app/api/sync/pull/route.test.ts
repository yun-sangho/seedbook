import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveUserId, pullChanges } = vi.hoisted(() => ({
  resolveUserId: vi.fn(),
  pullChanges: vi.fn(),
}));

vi.mock("@seedbook/database", () => ({ db: {} }));
vi.mock("@web/lib/auth-server", () => ({ resolveUserId }));
vi.mock("@web/server/sync/pull", () => ({ pullChanges }));

const { GET } = await import("./route");

function get(query = "") {
  return GET(new Request(`http://localhost/api/sync/pull${query}`));
}

describe("GET /api/sync/pull", () => {
  beforeEach(() => {
    resolveUserId.mockReset().mockResolvedValue("user-1");
    pullChanges
      .mockReset()
      .mockResolvedValue({ cursor: null, changes: { debt: [], listOrder: [] } });
  });

  it("responds 401 without a session", async () => {
    resolveUserId.mockResolvedValue(null);

    const res = await get();

    expect(res.status).toBe(401);
  });

  it("pulls everything for the session user when no since is given", async () => {
    const res = await get();

    expect(res.status).toBe(200);
    expect(pullChanges).toHaveBeenCalledWith(expect.anything(), "user-1", null);
  });

  it("passes a valid since cursor through", async () => {
    await get("?since=2026-11-08T00:00:00.000Z");

    expect(pullChanges).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      "2026-11-08T00:00:00.000Z"
    );
  });

  it("responds 400 for a malformed since", async () => {
    const res = await get("?since=yesterday");

    expect(res.status).toBe(400);
    expect(pullChanges).not.toHaveBeenCalled();
  });
});
