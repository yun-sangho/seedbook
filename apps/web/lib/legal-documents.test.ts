import { describe, expect, it } from "vitest";
import { legalDocumentHref, parseLegalDocumentHref } from "./legal-documents";

describe("parseLegalDocumentHref", () => {
  it("reads the current version of a document", () => {
    expect(parseLegalDocumentHref("/privacy")).toEqual({ document: "privacy" });
  });

  it("reads a specific version", () => {
    expect(parseLegalDocumentHref("/terms/2026-11-25")).toEqual({
      document: "terms",
      version: "2026-11-25",
    });
  });

  it("reads back every address legalDocumentHref makes", () => {
    expect(parseLegalDocumentHref(legalDocumentHref("terms", "2026-12-01"))).toEqual({
      document: "terms",
      version: "2026-12-01",
    });
  });

  it.each([
    ["another site page", "/help"],
    ["a nested path", "/terms/2026-11-25/x"],
    ["an external address", "https://example.com/terms"],
    ["a mail address", "mailto:a@b.c"],
    ["a query", "/terms?x=1"],
  ])("ignores %s", (_, href) => {
    expect(parseLegalDocumentHref(href)).toBeNull();
  });
});
