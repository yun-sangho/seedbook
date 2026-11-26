import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Article, Text } from "@seed-design/react";
import { kstDateString } from "@seedbook/database";
import type { LegalDocumentId } from "@seedbook/database/legal";
import { LegalMarkdown } from "@web/components/legal-markdown";
import { documentPage } from "@web/lib/legal/catalog";
import { koreanDate, LEGAL_DOCUMENTS, legalDocumentHref } from "@web/lib/legal-documents";
import { getLegalVersions } from "@web/server/legal/legal-versions";
import { SiteHeader } from "./site-header";

export function legalDocumentMetadata(document: LegalDocumentId): Metadata {
  const title = LEGAL_DOCUMENTS.find((d) => d.id === document)?.title ?? "";
  return { title: `${title} - Seedbook` };
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-bg-neutral-weak t4-regular text-fg-neutral rounded-r2 flex flex-col gap-x1 px-x4 py-x3 break-keep">
      {children}
    </div>
  );
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
  const { shown, state, current, next, history } = page;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-x4 py-x10 md:px-x8 md:py-x16">
        <Article>
          <div className="t5-regular text-fg-neutral-muted flex flex-col gap-x6">
            <div className="flex flex-col gap-x2">
              <Text as="h1" textStyle="t10Bold" color="fg.neutral">
                {shown.title}
              </Text>
              <p className="t4-regular">
                시행일 {koreanDate(shown.effectiveDate)}
                {state === "upcoming" && " (시행 예정)"}
                {state === "past" && " (지난 버전)"}
              </p>
            </div>

            {state === "current" && next && (
              <Notice>
                <p>
                  {koreanDate(next.effectiveDate)}부터 바뀌어요.
                  {next.summary && ` ${next.summary}`}
                </p>
                <Link href={legalDocumentHref(document, next.version)} className={linkClass}>
                  바뀌는 {shown.title} 보기
                </Link>
              </Notice>
            )}
            {state !== "current" && (
              <Notice>
                {state === "upcoming" && shown.summary && <p>바뀌는 내용: {shown.summary}</p>}
                {current && (
                  <Link href={legalDocumentHref(document)} className={linkClass}>
                    지금 시행 중인 {shown.title} 보기
                  </Link>
                )}
              </Notice>
            )}

            <LegalMarkdown source={shown.body} />

            {history.length > 1 && (
              <section className="flex flex-col gap-x3 pt-x7">
                <Text as="h2" textStyle="t6Bold" color="fg.neutral">
                  버전 기록
                </Text>
                <ul className="flex flex-col gap-x1">
                  {history.map((v) => (
                    <li key={v.version}>
                      {v.version === shown.version ? (
                        <span className="text-fg-neutral">{koreanDate(v.effectiveDate)} 시행</span>
                      ) : (
                        <Link href={legalDocumentHref(document, v.version)} className={linkClass}>
                          {koreanDate(v.effectiveDate)} 시행
                        </Link>
                      )}
                      {v === current && " (현재)"}
                      {v.effectiveDate > today && " (예정)"}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </Article>
      </main>
    </>
  );
}
