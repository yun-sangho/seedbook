import type { LegalDocumentId } from "@seedbook/database/legal";

export type { LegalDocumentId };

/**
 * 동의를 받는 문서와 공개 주소. 버전·본문은 `legal_document` (레포 `packages/database/src/legal/`)
 * 에 있고, 서버는 `server/legal/legal-versions.ts` 로 읽는다.
 */
export const LEGAL_DOCUMENTS = [
  { id: "terms", title: "이용약관", href: "/terms" },
  { id: "privacy", title: "개인정보처리방침", href: "/privacy" },
] as const satisfies ReadonlyArray<{ id: LegalDocumentId; title: string; href: string }>;

/** 문서 주소. 버전을 주면 그 버전 (지난·시행 예정 버전 보기). */
export function legalDocumentHref(id: LegalDocumentId, version?: string): string {
  const href = LEGAL_DOCUMENTS.find((document) => document.id === id)?.href ?? `/${id}`;
  // 버전 이름은 영문·숫자·.- 뿐이라 (`findVersionProblems`) 그대로 주소에 쓴다.
  return version ? `${href}/${version}` : href;
}

/** "2026-11-25" → "2026년 11월 25일". */
export function koreanDate(day: string): string {
  const [year, month, dayOfMonth] = day.split("-").map(Number);
  return `${year}년 ${month}월 ${dayOfMonth}일`;
}
