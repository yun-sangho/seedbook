import type { LegalDocumentId } from "@mobile/lib/legal-documents";

/** 약관 문서를 여는 스택 화면 (`stackflow.ts` 의 `Terms`·`Privacy`). */
export function legalActivityOf(document: LegalDocumentId): "Terms" | "Privacy" {
  return document === "terms" ? "Terms" : "Privacy";
}
