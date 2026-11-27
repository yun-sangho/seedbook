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

export interface LegalDocumentTarget {
  document: LegalDocumentId;
  /** 없으면 지금 시행 중인 버전. */
  version?: string;
}

/**
 * 같은 사이트의 약관 주소(`/terms`, `/privacy/2026-11-25` …)를 문서·버전으로 읽는다. 앱은 이 링크를
 * 사이트 페이지로 나가지 않고 앱 안 문서 화면으로 연다. 약관 주소가 아니면 null.
 */
export function parseLegalDocumentHref(href: string): LegalDocumentTarget | null {
  const match = /^(\/[a-z]+)(?:\/([0-9A-Za-z][0-9A-Za-z.-]*))?$/.exec(href);
  if (!match) return null;
  const document = LEGAL_DOCUMENTS.find((d) => d.href === match[1]);
  if (!document) return null;
  return match[2] ? { document: document.id, version: match[2] } : { document: document.id };
}
