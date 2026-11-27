import { randomUUID } from "node:crypto";
import { schema } from "@seedbook/database";
import { LEGAL_DOCUMENT_VERSIONS, type LegalDocumentVersion } from "@seedbook/database/legal";
import { openTestDb } from "@web/test/db/test-db";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import {
  consentStatus,
  deleteNewSignUp,
  hasRequiredConsents,
  isNewSignUp,
  NEW_SIGN_UP_WINDOW_MS,
  recordConsents,
} from "./consents";

const { db, createTestUser, close } = openTestDb();
afterAll(close);

// 2026-11-26 12:00 KST
const now = new Date("2026-11-26T03:00:00Z");
// 처음 공개한 버전들. 이후 레포에 추가된 개정과 상관없이 고정한다.
const FIRST = LEGAL_DOCUMENT_VERSIONS.filter((v) => v.effectiveDate === "2026-11-25");
const CURRENT = { terms: "2026-11-25", privacy: "2026-11-25" };
const revision = (
  effectiveDate: string,
  overrides: Partial<LegalDocumentVersion> = {}
): LegalDocumentVersion => ({
  document: "terms",
  version: effectiveDate,
  title: "이용약관",
  effectiveDate,
  requiresConsent: true,
  summary: "제5조를 바꿨어요",
  body: "## 1. 목적\n\n바뀐 본문",
  ...overrides,
});
const rows = (userId: string) =>
  db.select().from(schema.userConsent).where(eq(schema.userConsent.userId, userId));
const userExists = async (id: string) =>
  (await db.select().from(schema.user).where(eq(schema.user.id, id))).length === 1;
const addPortfolio = (userId: string) =>
  db.insert(schema.portfolio).values({ id: randomUUID(), userId, name: "p", color: "#000000" });

describe("recording consent (real Postgres)", () => {
  it("is missing until the user agrees", async () => {
    expect(await hasRequiredConsents(db, await createTestUser(), FIRST, now)).toBe(false);
  });

  it("records every document with its version and time", async () => {
    const userId = await createTestUser();

    expect(await recordConsents(db, userId, CURRENT, FIRST, now)).toBe(true);

    expect(await hasRequiredConsents(db, userId, FIRST, now)).toBe(true);
    expect(await rows(userId)).toEqual(
      expect.arrayContaining([
        { userId, document: "terms", version: "2026-11-25", agreedAt: now },
        { userId, document: "privacy", version: "2026-11-25", agreedAt: now },
      ])
    );
  });

  it.each([
    ["a document is left out", { terms: CURRENT.terms }],
    ["an older version was shown", { ...CURRENT, privacy: "2020-01-01" }],
    ["nothing was sent", {}],
    ["the body is not an object", null],
  ])("records nothing when %s", async (_, versions) => {
    const userId = await createTestUser();

    expect(await recordConsents(db, userId, versions, FIRST, now)).toBe(false);

    expect(await rows(userId)).toEqual([]);
  });

  it("records nothing for a version that has not taken effect yet", async () => {
    const userId = await createTestUser();
    const versions = [...FIRST, revision("2026-12-10")];

    expect(
      await recordConsents(db, userId, { ...CURRENT, terms: "2026-12-10" }, versions, now)
    ).toBe(false);
  });

  it("keeps the first time when the same version is agreed to again", async () => {
    const userId = await createTestUser();
    await recordConsents(db, userId, CURRENT, FIRST, now);

    await recordConsents(db, userId, CURRENT, FIRST, new Date(now.getTime() + 60_000));

    expect((await rows(userId)).map((r) => r.agreedAt)).toEqual([now, now]);
  });

  it("asks again once a revision that needs consent takes effect", async () => {
    const userId = await createTestUser();
    await recordConsents(db, userId, CURRENT, FIRST, now);
    const versions = [...FIRST, revision("2026-12-10")];

    expect(await hasRequiredConsents(db, userId, versions, new Date("2026-12-09T03:00:00Z"))).toBe(
      true
    );
    expect(await hasRequiredConsents(db, userId, versions, new Date("2026-12-10T03:00:00Z"))).toBe(
      false
    );
  });

  it("does not count another user's consent", async () => {
    await recordConsents(db, await createTestUser(), CURRENT, FIRST, now);
    expect(await hasRequiredConsents(db, await createTestUser(), FIRST, now)).toBe(false);
  });

  it("is removed with the account", async () => {
    const userId = await createTestUser();
    await recordConsents(db, userId, CURRENT, FIRST, now);

    await db.delete(schema.user).where(eq(schema.user.id, userId));

    expect(await rows(userId)).toEqual([]);
  });
});

describe("consent status (real Postgres)", () => {
  it("lists the current documents for a new sign-up", async () => {
    const userId = await createTestUser();

    expect(await consentStatus(db, userId, FIRST, now)).toEqual({
      agreed: false,
      newSignUp: true,
      documents: [
        {
          document: "terms",
          title: "이용약관",
          version: "2026-11-25",
          effectiveDate: "2026-11-25",
          change: null,
        },
        {
          document: "privacy",
          title: "개인정보처리방침",
          version: "2026-11-25",
          effectiveDate: "2026-11-25",
          change: null,
        },
      ],
    });
  });

  it("announces a revision before it takes effect", async () => {
    const userId = await createTestUser();
    await recordConsents(db, userId, CURRENT, FIRST, now);

    expect(await consentStatus(db, userId, [...FIRST, revision("2026-12-10")], now)).toEqual({
      agreed: true,
      notices: [
        {
          document: "terms",
          title: "이용약관",
          version: "2026-12-10",
          effectiveDate: "2026-12-10",
          summary: "제5조를 바꿨어요",
        },
      ],
    });
  });

  it("asks an existing user to agree to the revision once it takes effect", async () => {
    const userId = await createTestUser();
    await recordConsents(db, userId, CURRENT, FIRST, now);
    await addPortfolio(userId);

    const status = await consentStatus(
      db,
      userId,
      [...FIRST, revision("2026-12-10")],
      new Date("2026-12-10T03:00:00Z")
    );

    expect(status).toMatchObject({
      agreed: false,
      newSignUp: false,
      documents: [
        {
          document: "terms",
          version: "2026-12-10",
          change: { summary: "제5조를 바꿨어요", effectiveDate: "2026-12-10" },
        },
        { document: "privacy", version: "2026-11-25", change: null },
      ],
    });
  });
});

describe("declining (real Postgres)", () => {
  it("deletes the account that was just created", async () => {
    const userId = await createTestUser();

    expect(await isNewSignUp(db, userId, now)).toBe(true);
    expect(await deleteNewSignUp(db, userId, now)).toBe(true);

    expect(await userExists(userId)).toBe(false);
  });

  it("keeps an account that has existed for a while", async () => {
    const userId = await createTestUser();
    const later = new Date(Date.now() + NEW_SIGN_UP_WINDOW_MS + 60_000);

    expect(await deleteNewSignUp(db, userId, later)).toBe(false);

    expect(await userExists(userId)).toBe(true);
  });

  it("keeps an account that has ever agreed to a document", async () => {
    const userId = await createTestUser();
    await db
      .insert(schema.userConsent)
      .values({ userId, document: "terms", version: "2020-01-01", agreedAt: now });

    expect(await deleteNewSignUp(db, userId, now)).toBe(false);

    expect(await userExists(userId)).toBe(true);
  });

  it("keeps an account that has data on the server", async () => {
    const userId = await createTestUser();
    await addPortfolio(userId);

    expect(await deleteNewSignUp(db, userId, now)).toBe(false);

    expect(await userExists(userId)).toBe(true);
  });
});
