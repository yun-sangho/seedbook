import { type Database, db as defaultDb, schema } from "@seedbook/database";
import {
  LEGAL_DOCUMENT_IDS,
  LEGAL_DOCUMENT_VERSIONS,
  type LegalDocumentVersion,
} from "@seedbook/domain/legal";
import { inArray } from "drizzle-orm";
import { DB_TIMEOUT_MS, withDbTimeout } from "../db-timeout";

export interface LoadedLegalVersions {
  versions: readonly LegalDocumentVersion[];
  /** `fallback`: DB 를 읽지 못해 레포에 묶인 문서로 대신했다. */
  source: "database" | "fallback";
}

/**
 * 공개한 약관 버전들 (`legal_document`). DB 가 정본이고, 두 경우에만 레포에 묶인 같은 문서
 * (`LEGAL_DOCUMENT_VERSIONS`) 로 대신한다:
 *
 * - 아직 한 버전도 공개하지 않은 문서 — 배포 직후 `db:legal:publish` 를 돌리기 전. 첫 버전이 같아서
 *   기존 동의는 그대로 맞는다.
 * - DB 를 읽지 못하거나 `timeoutMs` 안에 답이 없음 — `/terms`·`/privacy` 는 계속 열린다. 동의
 *   확인은 어차피 `user_consent` 를 읽어야 해서 실패하고, 앱은 열리지 않는다 (fail closed).
 */
export async function loadLegalVersions(
  db: Database,
  { timeoutMs = DB_TIMEOUT_MS }: { timeoutMs?: number } = {}
): Promise<LoadedLegalVersions> {
  let rows: Array<typeof schema.legalDocument.$inferSelect>;
  try {
    rows = await withDbTimeout(
      async () =>
        db
          .select()
          .from(schema.legalDocument)
          .where(inArray(schema.legalDocument.document, [...LEGAL_DOCUMENT_IDS])),
      { ms: timeoutMs }
    );
  } catch (error) {
    console.error("[legal] legal_document 를 읽지 못해 레포의 문서로 대신한다", error);
    return { versions: LEGAL_DOCUMENT_VERSIONS, source: "fallback" };
  }

  const versions = LEGAL_DOCUMENT_IDS.flatMap((document): LegalDocumentVersion[] => {
    const published = rows.filter((row) => row.document === document);
    if (published.length === 0) {
      return LEGAL_DOCUMENT_VERSIONS.filter((v) => v.document === document);
    }
    return published.map(({ publishedAt: _, ...row }) => ({
      ...row,
      document,
    }));
  });
  return { versions, source: "database" };
}

/** 요청마다 DB 를 읽지 않도록 잠깐 기억한다. 새로 공개한 버전은 이만큼 늦게 보인다. */
const CACHE_MS = 60 * 1000;
let cached: { at: number; value: LoadedLegalVersions } | null = null;

export async function getLegalVersions(now = Date.now()): Promise<LoadedLegalVersions> {
  if (cached && now - cached.at < CACHE_MS) return cached.value;
  const value = await loadLegalVersions(defaultDb);
  // 대신한 결과는 기억하지 않는다 — DB 가 돌아오면 바로 정본을 쓴다.
  if (value.source === "database") cached = { at: now, value };
  return value;
}
