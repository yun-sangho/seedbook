import { type Database, schema } from "@seedbook/database";
import { LegalPublishError, publishLegalDocuments } from "@seedbook/database/legal/publish";
import type { LegalDocumentVersion } from "@seedbook/domain/legal";
import { openTestDb } from "@web/test/db/test-db";
import { TransactionRollbackError } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

const { db, close } = openTestDb();
afterAll(close);

/** legal_document 는 사용자에 묶이지 않은 공용 표라, 테스트마다 트랜잭션 안에서 하고 되돌린다. */
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

function version(
  document: LegalDocumentVersion["document"],
  effectiveDate: string,
  overrides: Partial<LegalDocumentVersion> = {}
): LegalDocumentVersion {
  return {
    document,
    version: effectiveDate,
    title: document === "terms" ? "이용약관" : "개인정보처리방침",
    effectiveDate,
    requiresConsent: true,
    summary: null,
    body: "## 1. 목적\n\n본문",
    ...overrides,
  };
}

const FIRST = [version("terms", "2026-11-25"), version("privacy", "2026-11-25")];
// 2026-11-26 12:00 KST
const now = new Date("2026-11-26T03:00:00Z");
const revision = (effectiveDate: string, overrides: Partial<LegalDocumentVersion> = {}) =>
  version("terms", effectiveDate, { summary: "제5조를 바꿨어요", ...overrides });

const rows = (tx: Database) => tx.select().from(schema.legalDocument);
const problemsOf = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => null,
    (e: unknown) => e
  );
  expect(error).toBeInstanceOf(LegalPublishError);
  return (error as LegalPublishError).problems;
};

describe("publishing legal documents (real Postgres)", () => {
  it("publishes the first versions even though they already took effect", async () => {
    await inRollback(async (tx) => {
      const result = await publishLegalDocuments(tx, FIRST, { now });

      expect(result).toEqual({
        published: ["terms@2026-11-25", "privacy@2026-11-25"],
        unchanged: [],
      });
      expect(await rows(tx)).toEqual(
        expect.arrayContaining([
          {
            document: "terms",
            version: "2026-11-25",
            title: "이용약관",
            body: "## 1. 목적\n\n본문",
            summary: null,
            effectiveDate: "2026-11-25",
            requiresConsent: true,
            publishedAt: now,
          },
        ])
      );
    });
  });

  it("does nothing the second time", async () => {
    await inRollback(async (tx) => {
      await publishLegalDocuments(tx, FIRST, { now });

      const again = await publishLegalDocuments(tx, FIRST, { now: new Date() });

      expect(again).toEqual({
        published: [],
        unchanged: ["terms@2026-11-25", "privacy@2026-11-25"],
      });
      expect((await rows(tx)).every((row) => row.publishedAt.getTime() === now.getTime())).toBe(
        true
      );
    });
  });

  it("refuses to change a published version", async () => {
    await inRollback(async (tx) => {
      await publishLegalDocuments(tx, FIRST, { now });
      const edited = [
        version("terms", "2026-11-25", { body: "## 1. 목적\n\n고친 본문" }),
        version("privacy", "2026-11-25"),
      ];

      expect(await problemsOf(publishLegalDocuments(tx, edited, { now }))).toEqual([
        "terms@2026-11-25: 이미 공개한 버전과 달라요 — 고치지 말고 새 버전을 추가해요",
      ]);
    });
  });

  it("adds a revision announced at least 7 days ahead", async () => {
    await inRollback(async (tx) => {
      await publishLegalDocuments(tx, FIRST, { now });

      const result = await publishLegalDocuments(tx, [...FIRST, revision("2026-12-03")], { now });

      expect(result.published).toEqual(["terms@2026-12-03"]);
    });
  });

  it("refuses a revision that needs consent with less than 7 days' notice", async () => {
    await inRollback(async (tx) => {
      await publishLegalDocuments(tx, FIRST, { now });

      expect(
        await problemsOf(publishLegalDocuments(tx, [...FIRST, revision("2026-12-02")], { now }))
      ).toEqual([
        "terms@2026-12-02: 시행일까지 7일이 안 남았어요 (2026-12-03 부터) — 출시 전이면 --allow-short-notice",
      ]);
      expect(await rows(tx)).toHaveLength(2);
    });
  });

  it("allows short notice when asked (before launch)", async () => {
    await inRollback(async (tx) => {
      await publishLegalDocuments(tx, FIRST, { now });

      const result = await publishLegalDocuments(tx, [...FIRST, revision("2026-11-26")], {
        now,
        allowShortNotice: true,
      });

      expect(result.published).toEqual(["terms@2026-11-26"]);
    });
  });

  it("allows a revision without consent on short notice", async () => {
    await inRollback(async (tx) => {
      await publishLegalDocuments(tx, FIRST, { now });

      const minor = revision("2026-11-27", { requiresConsent: false });
      const result = await publishLegalDocuments(tx, [...FIRST, minor], { now });

      expect(result.published).toEqual(["terms@2026-11-27"]);
    });
  });

  it("refuses a revision dated in the past", async () => {
    await inRollback(async (tx) => {
      await publishLegalDocuments(tx, FIRST, { now });
      const later = new Date("2026-11-28T03:00:00Z");

      expect(
        await problemsOf(
          publishLegalDocuments(tx, [...FIRST, revision("2026-11-27")], {
            now: later,
            allowShortNotice: true,
          })
        )
      ).toEqual(["terms@2026-11-27: 시행일(2026-11-27)이 이미 지났어요"]);
    });
  });

  it("refuses a revision that would come before one already published", async () => {
    await inRollback(async (tx) => {
      await publishLegalDocuments(tx, [...FIRST, revision("2026-12-10")], { now });

      expect(
        await problemsOf(
          publishLegalDocuments(tx, [...FIRST, revision("2026-12-05"), revision("2026-12-10")], {
            now,
          })
        )
      ).toEqual(["terms@2026-12-05: 공개한 버전(2026-12-10)보다 시행일이 늦어야 해요"]);
    });
  });

  it("refuses invalid versions before touching the database", async () => {
    await inRollback(async (tx) => {
      expect(
        await problemsOf(
          publishLegalDocuments(tx, [version("terms", "2026-11-25", { body: "" })], { now })
        )
      ).toEqual(["terms@2026-11-25: 본문이 비어 있어요"]);
      expect(await rows(tx)).toEqual([]);
    });
  });
});
