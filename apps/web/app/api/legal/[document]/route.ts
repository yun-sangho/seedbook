import { kstDateString } from "@seedbook/domain/kst";
import { LEGAL_DOCUMENT_IDS, type LegalDocumentId } from "@seedbook/domain/legal";
import { documentPage } from "@web/lib/legal/catalog";
import { getLegalVersions } from "@web/server/legal/legal-versions";

/**
 * 약관·개인정보처리방침 한 버전 (`?version=`, 없으면 지금 시행 중인 버전). 앱 안 문서 화면
 * (`components/legal-document-view.tsx`) 이 읽는다. `/terms`·`/privacy` 와 같은 공개 문서라 로그인이
 * 필요 없다.
 */
export const dynamic = "force-dynamic";

function isLegalDocumentId(value: string): value is LegalDocumentId {
  return (LEGAL_DOCUMENT_IDS as readonly string[]).includes(value);
}

export async function GET(request: Request, { params }: { params: Promise<{ document: string }> }) {
  const { document } = await params;
  if (!isLegalDocumentId(document)) return Response.json({ error: "not found" }, { status: 404 });

  const version = new URL(request.url).searchParams.get("version") ?? undefined;
  const { versions } = await getLegalVersions();
  const today = kstDateString(new Date());
  const page = documentPage(versions, document, version, today);
  if (!page) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ today, page });
}
