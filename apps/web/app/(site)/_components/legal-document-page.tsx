import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { kstDateString } from "@seedbook/database";
import type { LegalDocumentId } from "@seedbook/database/legal";
import { LegalDocumentContent } from "@web/components/legal-document-content";
import { documentPage } from "@web/lib/legal/catalog";
import { LEGAL_DOCUMENTS, legalDocumentHref } from "@web/lib/legal-documents";
import { getLegalVersions } from "@web/server/legal/legal-versions";
import { SiteHeader } from "./site-header";

export function legalDocumentMetadata(document: LegalDocumentId): Metadata {
  const title = LEGAL_DOCUMENTS.find((d) => d.id === document)?.title ?? "";
  return { title: `${title} - Seedbook` };
}

const linkClass = "text-fg-neutral underline underline-offset-4";

/**
 * 약관·개인정보처리방침 공개 페이지 (로그인 불필요). 버전이 없으면 지금 시행 중인 버전, 있으면 그
 * 버전(지난·시행 예정)을 보여 준다. 본문은 `legal_document` — DB 를 읽지 못하면 레포의 같은 문서.
 * 앱 스토어·카카오 로그인 심사에 `/privacy` 주소를 쓴다.
 */
export async function LegalDocumentPage({
  document,
  version,
}: {
  document: LegalDocumentId;
  version?: string;
}) {
  // 요청 때마다 DB 를 읽는다 (빌드 때 굳히지 않는다).
  await connection();
  const { versions } = await getLegalVersions();
  const today = kstDateString(new Date());
  const page = documentPage(versions, document, version, today);
  if (!page) notFound();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-x4 py-x10 md:px-x8 md:py-x16">
        <LegalDocumentContent
          page={page}
          today={today}
          renderVersionLink={(linkVersion, children) => (
            <Link href={legalDocumentHref(document, linkVersion)} className={linkClass}>
              {children}
            </Link>
          )}
        />
      </main>
    </>
  );
}
