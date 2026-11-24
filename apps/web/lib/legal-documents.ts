/**
 * 동의를 받는 문서. `version` 은 시행일(YYYY-MM-DD)이다 — 바꾸면 모든 사용자가 다음 접속 때 다시
 * 동의한다. 동의를 다시 받을 필요가 없는 수정(오타 등)이면 그대로 둔다.
 */
export const LEGAL_DOCUMENTS = [
  { id: "terms", title: "이용약관", href: "/terms", version: "2026-11-25" },
  { id: "privacy", title: "개인정보처리방침", href: "/privacy", version: "2026-11-25" },
] as const;

export type LegalDocumentId = (typeof LEGAL_DOCUMENTS)[number]["id"];

export function effectiveDateLabel(id: LegalDocumentId): string {
  const version = LEGAL_DOCUMENTS.find((document) => document.id === id)?.version ?? "";
  const [year, month, day] = version.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일`;
}
