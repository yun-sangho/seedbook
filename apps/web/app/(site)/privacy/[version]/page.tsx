import { LegalDocumentPage, legalDocumentMetadata } from "../../_components/legal-document-page";

export const metadata = legalDocumentMetadata("privacy");

/** 개인정보처리방침의 한 버전 (지난 버전·시행 예정 버전). */
export default async function PrivacyVersionPage({
  params,
}: {
  params: Promise<{ version: string }>;
}) {
  const { version } = await params;
  return <LegalDocumentPage document="privacy" version={version} />;
}
