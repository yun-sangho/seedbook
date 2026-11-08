import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForeignRowError } from "../_translators/ownership";

const write = vi.fn();

vi.mock("@seedbook/database", () => ({ db: {} }));
vi.mock("@web/lib/auth-server", () => ({ resolveUserId: vi.fn(async () => "user-1") }));
vi.mock("@web/app/api/storage/_translators", () => ({
  TRANSLATORS: new Proxy({}, { get: () => ({ read: vi.fn(), write }) }),
}));

const { PUT } = await import("./route");

function putRequest(data: unknown): [Request, { params: Promise<{ key: string }> }] {
  return [
    new Request("http://localhost/api/storage/investment-storage", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data }),
    }),
    { params: Promise.resolve({ key: "investment-storage" }) },
  ];
}

describe("PUT /api/storage/[key]", () => {
  beforeEach(() => {
    write.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("responds 200 when the translator writes successfully", async () => {
    write.mockResolvedValue(undefined);

    const res = await PUT(...putRequest({ state: {}, version: 4 }));

    expect(res.status).toBe(200);
  });

  it("responds 403 when the envelope reuses another user's row id", async () => {
    write.mockRejectedValue(new ForeignRowError("investment_account"));

    const res = await PUT(...putRequest({ state: {}, version: 4 }));

    expect(res.status).toBe(403);
  });

  it("responds 500 on other write failures", async () => {
    write.mockRejectedValue(new Error("db down"));

    const res = await PUT(...putRequest({ state: {}, version: 4 }));

    expect(res.status).toBe(500);
  });
});
