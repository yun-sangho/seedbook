import { LegalDocumentPage, legalDocumentMetadata } from "../_components/legal-document-page";

export const metadata = legalDocumentMetadata("terms");

/** 이용약관 (공개 페이지). 본문은 `packages/database/src/legal/` 에서 쓰고 `db:legal:publish` 로 공개한다. */
export default function TermsPage() {
  return <LegalDocumentPage document="terms" />;
}
