import { describe, expect, it } from "vitest";
import { adminTokenConfigured, isAdminRequest } from "./admin-token";

const TOKEN = "x".repeat(40);

describe("operator token", () => {
  it("accepts the configured bearer token", () => {
    expect(isAdminRequest(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
  });

  it("rejects a different token", () => {
    expect(isAdminRequest(`Bearer ${"y".repeat(40)}`, TOKEN)).toBe(false);
  });

  it("rejects a request without a token", () => {
    expect(isAdminRequest(null, TOKEN)).toBe(false);
  });

  it("keeps the API closed when the server has no token", () => {
    expect(isAdminRequest("Bearer ", "")).toBe(false);
  });

  it("treats a too-short server token as not configured", () => {
    expect(adminTokenConfigured("short")).toBe(false);
  });
});
