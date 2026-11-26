import { LegalDocumentPage, legalDocumentMetadata } from "../../_components/legal-document-page";

export const metadata = legalDocumentMetadata("terms");

/** 이용약관의 한 버전 (지난 버전·시행 예정 버전). */
export default async function TermsVersionPage({
  params,
}: {
  params: Promise<{ version: string }>;
}) {
  const { version } = await params;
  return <LegalDocumentPage document="terms" version={version} />;
}
