import { LegalDocumentPage, legalDocumentMetadata } from "../_components/legal-document-page";

export const metadata = legalDocumentMetadata("privacy");

/**
 * 개인정보처리방침 (공개 페이지, 로그인 불필요). 앱 스토어 등록·카카오 로그인 심사에 이 URL
 * (`/privacy`)을 쓴다. 모바일 UA 도 proxy 가 그대로 통과시킨다 (`lib/device.ts`).
 */
export default function PrivacyPage() {
  return <LegalDocumentPage document="privacy" />;
}
