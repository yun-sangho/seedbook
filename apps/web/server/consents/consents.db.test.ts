import { randomUUID } from "node:crypto";
import { schema } from "@seedbook/database";
import { LEGAL_DOCUMENTS } from "@web/lib/legal-documents";
import { openTestDb } from "@web/test/db/test-db";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import {
  deleteNewSignUp,
  hasRequiredConsents,
  isNewSignUp,
  NEW_SIGN_UP_WINDOW_MS,
  recordConsents,
} from "./consents";

const { db, createTestUser, close } = openTestDb();
afterAll(close);

const CURRENT = Object.fromEntries(LEGAL_DOCUMENTS.map((d) => [d.id, d.version]));
const now = new Date();
const rows = (userId: string) =>
  db.select().from(schema.userConsent).where(eq(schema.userConsent.userId, userId));
const userExists = async (id: string) =>
  (await db.select().from(schema.user).where(eq(schema.user.id, id))).length === 1;
const addPortfolio = (userId: string) =>
  db.insert(schema.portfolio).values({ id: randomUUID(), userId, name: "p", color: "#000000" });

describe("recording consent (real Postgres)", () => {
  it("is missing until the user agrees", async () => {
    expect(await hasRequiredConsents(db, await createTestUser())).toBe(false);
  });

  it("records every document with its version and time", async () => {
    const userId = await createTestUser();

    expect(await recordConsents(db, userId, CURRENT, now)).toBe(true);

    expect(await hasRequiredConsents(db, userId)).toBe(true);
    expect(await rows(userId)).toEqual(
      expect.arrayContaining(
        LEGAL_DOCUMENTS.map((d) => ({
          userId,
          document: d.id,
          version: d.version,
          agreedAt: now,
        }))
      )
    );
  });

  it.each([
    ["a document is left out", { terms: CURRENT.terms }],
    ["an older version was shown", { ...CURRENT, privacy: "2020-01-01" }],
    ["nothing was sent", {}],
    ["the body is not an object", null],
  ])("records nothing when %s", async (_, versions) => {
    const userId = await createTestUser();

    expect(await recordConsents(db, userId, versions, now)).toBe(false);

    expect(await rows(userId)).toEqual([]);
  });

  it("keeps the first time when the same version is agreed to again", async () => {
    const userId = await createTestUser();
    await recordConsents(db, userId, CURRENT, now);

    await recordConsents(db, userId, CURRENT, new Date(now.getTime() + 60_000));

    expect((await rows(userId)).map((r) => r.agreedAt)).toEqual([now, now]);
  });

  it("asks again when a document has a newer version", async () => {
    const userId = await createTestUser();
    await db.insert(schema.userConsent).values(
      LEGAL_DOCUMENTS.map((d) => ({
        userId,
        document: d.id,
        version: d.id === "terms" ? "2020-01-01" : d.version,
        agreedAt: now,
      }))
    );

    expect(await hasRequiredConsents(db, userId)).toBe(false);
  });

  it("does not count another user's consent", async () => {
    await recordConsents(db, await createTestUser(), CURRENT, now);
    expect(await hasRequiredConsents(db, await createTestUser())).toBe(false);
  });

  it("is removed with the account", async () => {
    const userId = await createTestUser();
    await recordConsents(db, userId, CURRENT, now);

    await db.delete(schema.user).where(eq(schema.user.id, userId));

    expect(await rows(userId)).toEqual([]);
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
