import type { ReactNode } from "react";
import { Article, Text } from "@seed-design/react";
import { LegalMarkdown } from "@web/components/legal-markdown";
import type { DocumentPage } from "@web/lib/legal/catalog";
import { koreanDate } from "@web/lib/legal-documents";

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="bg-bg-neutral-weak t4-regular text-fg-neutral rounded-r2 flex flex-col gap-x1 px-x4 py-x3 break-keep">
      {children}
    </div>
  );
}

/** 다른 버전으로 가는 링크. 사이트는 주소(`/terms/<버전>`), 앱은 화면 전환으로 그린다. */
export type LegalVersionLink = (version: string | undefined, children: ReactNode) => ReactNode;

/**
 * 약관·개인정보처리방침 한 버전의 본문 (제목·시행일, 개정 안내, 본문, 버전 기록). 사이트 페이지
 * (`app/(site)/_components/legal-document-page.tsx`) 와 앱 화면(`legal-document-view.tsx`)이 함께 쓴다.
 */
export function LegalDocumentContent({
  page,
  today,
  renderVersionLink,
  showTitle = true,
}: {
  page: DocumentPage;
  today: string;
  renderVersionLink: LegalVersionLink;
  /** 앱 화면은 앱바가 제목을 보여 주므로 본문 제목을 뺀다. */
  showTitle?: boolean;
}) {
  const { shown, state, current, next, history } = page;
  const dateLine = (
    <p className="t4-regular">
      시행일 {koreanDate(shown.effectiveDate)}
      {state === "upcoming" && " (시행 예정)"}
      {state === "past" && " (지난 버전)"}
    </p>
  );

  return (
    <Article>
      <div className="t5-regular text-fg-neutral-muted flex flex-col gap-x6">
        {showTitle ? (
          <div className="flex flex-col gap-x2">
            <Text as="h1" textStyle="t10Bold" color="fg.neutral">
              {shown.title}
            </Text>
            {dateLine}
          </div>
        ) : (
          dateLine
        )}

        {state === "current" && next && (
          <Notice>
            <p>
              {koreanDate(next.effectiveDate)}부터 바뀌어요.
              {next.summary && ` ${next.summary}`}
            </p>
            {renderVersionLink(next.version, `바뀌는 ${shown.title} 보기`)}
          </Notice>
        )}
        {state !== "current" && (
          <Notice>
            {state === "upcoming" && shown.summary && <p>바뀌는 내용: {shown.summary}</p>}
            {current && renderVersionLink(undefined, `지금 시행 중인 ${shown.title} 보기`)}
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
                    renderVersionLink(v.version, `${koreanDate(v.effectiveDate)} 시행`)
                  )}
                  {v.version === current?.version && " (현재)"}
                  {v.effectiveDate > today && " (예정)"}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Article>
  );
}
