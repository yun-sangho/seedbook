/** 동의를 받는 문서. */
export const LEGAL_DOCUMENT_IDS = ["terms", "privacy"] as const;
export type LegalDocumentId = (typeof LEGAL_DOCUMENT_IDS)[number];

/**
 * 약관·개인정보처리방침의 한 버전. 레포에서 쓰고 `db:legal:publish` 로 `legal_document` 에 공개한다.
 * 공개한 버전은 고치지 않는다 — 바꾸려면 새 버전 파일을 추가한다.
 */
export interface LegalDocumentVersion {
  document: LegalDocumentId;
  /** 문서 안에서 고유한 버전 이름. 시행일(YYYY-MM-DD)을 쓴다. 기존 동의 기록이 이 값을 가리킨다. */
  version: string;
  title: string;
  /** 시행일 (KST 달력일, YYYY-MM-DD). 이날 00:00 KST 부터 현재 버전이다. */
  effectiveDate: string;
  /** 시행일부터 이 버전에 다시 동의해야 쓸 수 있는가. 오타 수정 같은 개정이면 false. */
  requiresConsent: boolean;
  /** 바뀐 내용 요약 (안내·재동의 화면에 보인다). 첫 버전은 null. */
  summary: string | null;
  /** 본문. 작은 마크다운 (`./markdown.ts`), HTML 은 쓰지 않는다. */
  body: string;
}
