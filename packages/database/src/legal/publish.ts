import { inArray } from "drizzle-orm";
import type { Database } from "../client";
import { kstDateString } from "../kst";
import { legalDocument } from "../schema";
import type { LegalDocumentVersion } from "./types";
import { findVersionProblems } from "./validate";

/** 재동의가 필요한 개정은 시행일 이만큼 전에 공개해 앱 안에서 안내한다. */
export const NOTICE_DAYS = 7;

export class LegalPublishError extends Error {
  constructor(readonly problems: string[]) {
    super(`약관을 공개하지 못했어요:\n${problems.map((p) => `- ${p}`).join("\n")}`);
    this.name = "LegalPublishError";
  }
}

export interface PublishOptions {
  now: Date;
  /** 사전 안내 기간(7일)을 건너뛴다. 출시 전처럼 공지 없이 바꿔도 될 때만. */
  allowShortNotice?: boolean;
}

export interface PublishResult {
  /** 이번에 넣은 버전 ("문서@버전"). */
  published: string[];
  /** 이미 같은 내용으로 공개돼 있던 버전. */
  unchanged: string[];
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function sameContent(
  published: typeof legalDocument.$inferSelect,
  version: LegalDocumentVersion
): boolean {
  return (
    published.title === version.title &&
    published.body === version.body &&
    published.summary === version.summary &&
    published.effectiveDate === version.effectiveDate &&
    published.requiresConsent === version.requiresConsent
  );
}

/**
 * 레포의 버전들을 `legal_document` 에 공개한다. 멱등 — 이미 같은 내용이면 건너뛴다.
 * 공개한 버전과 내용이 다르거나, 새 개정의 시행일이 맞지 않으면 아무것도 넣지 않고 `LegalPublishError`.
 *
 * 새 개정의 시행일은 오늘(KST) 이후이고 공개한 버전들보다 늦어야 한다. 재동의가 필요한 개정은
 * 7일 뒤부터다 (`allowShortNotice` 면 오늘부터). 문서의 첫 버전은 날짜를 따지지 않는다.
 */
export async function publishLegalDocuments(
  db: Database,
  versions: readonly LegalDocumentVersion[],
  { now, allowShortNotice = false }: PublishOptions
): Promise<PublishResult> {
  const invalid = findVersionProblems(versions);
  if (invalid.length > 0) throw new LegalPublishError(invalid);

  const today = kstDateString(now);
  const earliestNotice = addDays(today, allowShortNotice ? 0 : NOTICE_DAYS);
  const documents = [...new Set(versions.map((v) => v.document))];

  return db.transaction(async (tx) => {
    const published =
      documents.length === 0
        ? []
        : await tx.select().from(legalDocument).where(inArray(legalDocument.document, documents));

    const problems: string[] = [];
    const result: PublishResult = { published: [], unchanged: [] };
    const toInsert: LegalDocumentVersion[] = [];

    for (const version of versions) {
      const key = `${version.document}@${version.version}`;
      const report = (problem: string) => problems.push(`${key}: ${problem}`);
      const ofDocument = published.filter((row) => row.document === version.document);
      const existing = ofDocument.find((row) => row.version === version.version);

      if (existing) {
        if (sameContent(existing, version)) result.unchanged.push(key);
        else report("이미 공개한 버전과 달라요 — 고치지 말고 새 버전을 추가해요");
        continue;
      }

      const isFirst =
        ofDocument.length === 0 &&
        versions.every(
          (other) =>
            other.document !== version.document || other.effectiveDate >= version.effectiveDate
        );
      if (!isFirst) {
        const latest = ofDocument
          .map((row) => row.effectiveDate)
          .sort()
          .at(-1);
        if (latest !== undefined && version.effectiveDate <= latest) {
          report(`공개한 버전(${latest})보다 시행일이 늦어야 해요`);
        } else if (version.effectiveDate < today) {
          report(`시행일(${version.effectiveDate})이 이미 지났어요`);
        } else if (version.requiresConsent && version.effectiveDate < earliestNotice) {
          report(
            `시행일까지 ${NOTICE_DAYS}일이 안 남았어요 (${earliestNotice} 부터) — 출시 전이면 --allow-short-notice`
          );
        }
      }
      toInsert.push(version);
      result.published.push(key);
    }

    if (problems.length > 0) throw new LegalPublishError(problems);
    if (toInsert.length > 0) {
      await tx.insert(legalDocument).values(toInsert.map((v) => ({ ...v, publishedAt: now })));
    }
    return result;
  });
}
