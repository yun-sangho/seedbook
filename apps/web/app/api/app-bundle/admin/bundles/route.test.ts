import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const TOKEN = "t".repeat(40);

afterEach(() => vi.unstubAllEnvs());

describe("operator bundle API", () => {
  it("does not exist when the server has no operator token", async () => {
    vi.stubEnv("APP_BUNDLE_ADMIN_TOKEN", "");

    const response = await GET(new Request("http://localhost/api/app-bundle/admin/bundles"));

    expect(response.status).toBe(404);
  });

  it("rejects an upload without the operator token", async () => {
    vi.stubEnv("APP_BUNDLE_ADMIN_TOKEN", TOKEN);

    const response = await POST(
      new Request("http://localhost/api/app-bundle/admin/bundles?id=abc", {
        method: "POST",
        body: "zip",
      })
    );

    expect(response.status).toBe(401);
  });

  it("rejects an upload with malformed metadata before reading the database", async () => {
    vi.stubEnv("APP_BUNDLE_ADMIN_TOKEN", TOKEN);

    const response = await POST(
      new Request("http://localhost/api/app-bundle/admin/bundles?id=../x&appVersion=1.0.0", {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}` },
        body: "zip",
      })
    );

    expect(response.status).toBe(400);
  });
});
