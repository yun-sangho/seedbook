import type { LegalDocumentVersion } from "@seedbook/domain/legal";
import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const terms: LegalDocumentVersion = {
  document: "terms",
  version: "2026-11-25",
  title: "이용약관",
  effectiveDate: "2026-11-25",
  requiresConsent: true,
  summary: null,
  body: "이용약관 본문",
};

vi.mock("@web/server/legal/legal-versions", () => ({
  getLegalVersions: async () => ({ versions: [terms], source: "database" }),
}));

const get = (document: string, query = "") =>
  GET(new Request(`http://localhost/api/legal/${document}${query}`), {
    params: Promise.resolve({ document }),
  });

describe("GET /api/legal/[document]", () => {
  it("returns the version in force when no version is given", async () => {
    const response = await get("terms");

    expect(response.status).toBe(200);
    const { page } = await response.json();
    expect(page.shown.body).toBe("이용약관 본문");
    expect(page.state).toBe("current");
  });

  it("returns the requested version", async () => {
    const response = await get("terms", "?version=2026-11-25");

    expect((await response.json()).page.shown.version).toBe("2026-11-25");
  });

  it("answers 404 for a version that does not exist", async () => {
    expect((await get("terms", "?version=1999-01-01")).status).toBe(404);
  });

  it("answers 404 for an unknown document", async () => {
    expect((await get("cookies")).status).toBe(404);
  });
});
