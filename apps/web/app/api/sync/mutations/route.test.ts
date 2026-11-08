import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveUserId, applyMutation } = vi.hoisted(() => ({
  resolveUserId: vi.fn(),
  applyMutation: vi.fn(),
}));

vi.mock("@seedbook/database", () => ({ db: {} }));
vi.mock("@web/lib/auth-server", () => ({ resolveUserId }));
vi.mock("@web/server/sync/apply-mutation", () => ({ applyMutation }));

const { POST } = await import("./route");
const { MAX_MUTATIONS } = await import("@web/server/sync/types");

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/sync/mutations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

describe("POST /api/sync/mutations", () => {
  beforeEach(() => {
    resolveUserId.mockReset().mockResolvedValue("user-1");
    applyMutation.mockReset().mockResolvedValue({ status: "ok", version: 1 });
  });

  it("responds 401 without a session", async () => {
    resolveUserId.mockResolvedValue(null);

    const res = await post({ mutations: [] });

    expect(res.status).toBe(401);
  });

  it("responds 400 when mutations is not an array", async () => {
    const res = await post({ mutations: "nope" });

    expect(res.status).toBe(400);
  });

  it("responds 400 on invalid json", async () => {
    const res = await post("{");

    expect(res.status).toBe(400);
  });

  it("responds 413 when the batch is too large", async () => {
    const res = await post({ mutations: Array.from({ length: MAX_MUTATIONS + 1 }, () => ({})) });

    expect(res.status).toBe(413);
    expect(applyMutation).not.toHaveBeenCalled();
  });

  it("applies mutations in order for the session user and returns one result each", async () => {
    const order: string[] = [];
    applyMutation.mockImplementation(async (_db, userId, m: { id: string }) => {
      order.push(`${userId}:${m.id}`);
      return { status: "ok", version: 1 };
    });

    const res = await post({ mutations: [{ id: "a" }, { id: "b" }] });

    expect(res.status).toBe(200);
    expect(order).toEqual(["user-1:a", "user-1:b"]);
    expect(await res.json()).toEqual({
      results: [
        { status: "ok", version: 1 },
        { status: "ok", version: 1 },
      ],
    });
  });
});
