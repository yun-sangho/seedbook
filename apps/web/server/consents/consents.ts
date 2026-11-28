import { type Database, schema } from "@seedbook/database";
import { kstDateString } from "@seedbook/domain/kst";
import type { LegalDocumentVersion } from "@seedbook/domain/legal";
import {
  type ConsentDocument,
  consentDocuments,
  hasAgreedToCurrent,
  type LegalNotice,
  upcomingNotices,
} from "@web/lib/legal/catalog";
import { and, eq, gt, notExists, type SQL } from "drizzle-orm";

/**
 * 약관·개인정보 동의 (`user_consent`). 첫 가입·기존 사용자·약관 개정을 "현재 버전(재동의가 필요한
 * 마지막 개정 이후)에 모두 동의한 기록이 있는가" 하나로 판단한다. 로그인 방법(카카오·Apple·생체
 * 인증)과 상관없다. 버전 목록은 `server/legal/legal-versions.ts` 가 준다.
 */

function agreedVersions(db: Database, userId: string) {
  return db
    .select({ document: schema.userConsent.document, version: schema.userConsent.version })
    .from(schema.userConsent)
    .where(eq(schema.userConsent.userId, userId));
}

export async function hasRequiredConsents(
  db: Database,
  userId: string,
  versions: readonly LegalDocumentVersion[],
  now: Date
): Promise<boolean> {
  return hasAgreedToCurrent(versions, await agreedVersions(db, userId), kstDateString(now));
}

export type ConsentStatus =
  | { agreed: true; notices: LegalNotice[] }
  | { agreed: false; newSignUp: boolean; documents: ConsentDocument[] };

/** 동의했으면 시행일 전 안내할 개정을, 아니면 동의 화면에 보여 줄 문서를 함께 준다. */
export async function consentStatus(
  db: Database,
  userId: string,
  versions: readonly LegalDocumentVersion[],
  now: Date
): Promise<ConsentStatus> {
  const today = kstDateString(now);
  const agreed = await agreedVersions(db, userId);
  if (hasAgreedToCurrent(versions, agreed, today)) {
    return { agreed: true, notices: upcomingNotices(versions, today) };
  }
  return {
    agreed: false,
    newSignUp: await isNewSignUp(db, userId, now),
    documents: consentDocuments(versions, agreed, today),
  };
}

/**
 * 동의를 기록한다. `shown` 은 화면이 보여 준 문서별 버전 — 하나라도 빠지거나 지금 버전과 다르면
 * (화면을 연 뒤 개정됨) 아무것도 기록하지 않고 false.
 */
export async function recordConsents(
  db: Database,
  userId: string,
  shown: unknown,
  versions: readonly LegalDocumentVersion[],
  now: Date
): Promise<boolean> {
  const current = consentDocuments(versions, [], kstDateString(now));
  const sent = (shown ?? {}) as Record<string, unknown>;
  if (current.length === 0 || !current.every((d) => sent[d.document] === d.version)) return false;
  await db
    .insert(schema.userConsent)
    .values(
      current.map((d) => ({ userId, document: d.document, version: d.version, agreedAt: now }))
    )
    .onConflictDoNothing();
  return true;
}

/** 가입하고 이 시간 안에 동의를 거부하면 방금 만든 계정으로 본다. */
export const NEW_SIGN_UP_WINDOW_MS = 30 * 60 * 1000;

/**
 * 방금 가입해 아직 아무것도 하지 않은 계정. 동의 기능 전부터 있던 사용자도 동의 기록이 없으므로
 * 기록 유무만으로 판단하지 않는다 — 만든 시각과 서버 데이터까지 본다.
 */
function newSignUpCondition(db: Database, userId: string, now: Date): SQL | undefined {
  const { user, userConsent, investmentAccount, portfolio, rebalancing, userPreference } = schema;
  const owned = [userConsent, investmentAccount, portfolio, rebalancing, userPreference];
  return and(
    eq(user.id, userId),
    gt(user.createdAt, new Date(now.getTime() - NEW_SIGN_UP_WINDOW_MS)),
    ...owned.map((table) =>
      notExists(db.select({ userId: table.userId }).from(table).where(eq(table.userId, userId)))
    )
  );
}

export async function isNewSignUp(db: Database, userId: string, now: Date): Promise<boolean> {
  const rows = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(newSignUpCondition(db, userId, now));
  return rows.length > 0;
}

/** 방금 만든 계정이면 지운다 (세션·연결된 로그인도 cascade). 아니면 아무것도 하지 않고 false. */
export async function deleteNewSignUp(db: Database, userId: string, now: Date): Promise<boolean> {
  const rows = await db
    .delete(schema.user)
    .where(newSignUpCondition(db, userId, now))
    .returning({ id: schema.user.id });
  return rows.length > 0;
}
