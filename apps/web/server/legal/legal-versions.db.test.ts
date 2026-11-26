import { type Database, schema } from "@seedbook/database";
import { LEGAL_DOCUMENT_VERSIONS } from "@seedbook/database/legal";
import { openTestDb } from "@web/test/db/test-db";
import { TransactionRollbackError } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { loadLegalVersions } from "./legal-versions";

const { db, close } = openTestDb();
afterAll(close);

async function inRollback(fn: (tx: Database) => Promise<void>) {
  await db
    .transaction(async (tx) => {
      await tx.delete(schema.legalDocument);
      await fn(tx as unknown as Database);
      tx.rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof TransactionRollbackError)) throw error;
    });
}

const publishedRow = {
  document: "terms",
  version: "2030-01-01",
  title: "이용약관",
  body: "## 1. 목적\n\nDB 본문",
  summary: "바뀜",
  effectiveDate: "2030-01-01",
  requiresConsent: true,
  publishedAt: new Date(),
};

describe("loading legal versions (real Postgres)", () => {
  it("uses the published versions of a document", async () => {
    await inRollback(async (tx) => {
      await tx.insert(schema.legalDocument).values(publishedRow);

      const { versions, source } = await loadLegalVersions(tx);

      expect(source).toBe("database");
      expect(versions.filter((v) => v.document === "terms")).toEqual([
        {
          document: "terms",
          version: "2030-01-01",
          title: "이용약관",
          body: "## 1. 목적\n\nDB 본문",
          summary: "바뀜",
          effectiveDate: "2030-01-01",
          requiresConsent: true,
        },
      ]);
    });
  });

  it("falls back to the repo copy of a document nobody has published yet", async () => {
    await inRollback(async (tx) => {
      await tx.insert(schema.legalDocument).values(publishedRow);

      const { versions } = await loadLegalVersions(tx);

      expect(versions.filter((v) => v.document === "privacy")).toEqual(
        LEGAL_DOCUMENT_VERSIONS.filter((v) => v.document === "privacy")
      );
    });
  });

  it("falls back to the repo copy when the database fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = {
      select: () => {
        throw new Error("connection refused");
      },
    } as unknown as Database;

    expect(await loadLegalVersions(broken)).toEqual({
      versions: LEGAL_DOCUMENT_VERSIONS,
      source: "fallback",
    });
  });
});
