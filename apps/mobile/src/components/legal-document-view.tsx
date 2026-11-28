"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import { LegalDocumentContent } from "@mobile/components/legal-document-content";
import { apiFetch } from "@mobile/lib/api-client";
import type { DocumentPage } from "@mobile/lib/legal/catalog";
import type { LegalDocumentTarget } from "@mobile/lib/legal-documents";
import { ActionButton } from "@mobile/seed-design/ui/action-button";
import { Callout } from "@mobile/seed-design/ui/callout";
import { ProgressCircle } from "@mobile/seed-design/ui/progress-circle";
import type { LegalDocumentId } from "@seedbook/domain/legal";

interface LoadedDocument {
  today: string;
  page: DocumentPage;
}

type LoadState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "loaded"; document: LoadedDocument };

async function fetchLegalDocument(
  document: LegalDocumentId,
  version: string | undefined
): Promise<LoadedDocument | null> {
  const query = version ? `?version=${encodeURIComponent(version)}` : "";
  try {
    const response = await apiFetch(`/api/legal/${document}${query}`);
    if (!response.ok) return null;
    return (await response.json()) as LoadedDocument;
  } catch {
    return null;
  }
}

/**
 * 앱 안에서 보는 약관·개인정보처리방침 (`/api/legal/<문서>`, DB 에 공개한 최신 버전). 사이트
 * 페이지(`/terms`·`/privacy`) 와 같은 본문을 그리고, 다른 버전 링크와 본문 안 약관 링크는 사이트로
 * 나가지 않고 `onOpen` 으로 넘긴다 (설정 화면은 push, 동의 화면 문서 보기는 제자리에서 바꾼다).
 */
export function LegalDocumentView({
  document,
  version,
  onOpen,
}: {
  document: LegalDocumentId;
  version?: string;
  onOpen: (target: LegalDocumentTarget) => void;
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    const loaded = await fetchLegalDocument(document, version);
    setState(loaded ? { status: "loaded", document: loaded } : { status: "failed" });
  }, [document, version]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === "loading") {
    return (
      <div className="flex justify-center py-x10">
        <ProgressCircle size="24" aria-label="문서를 불러오는 중" />
      </div>
    );
  }

  if (state.status === "failed") {
    return (
      <div role="alert" className="flex flex-col gap-x2 px-x4 py-x6">
        <Callout tone="neutral" description="문서를 불러오지 못했어요." />
        <ActionButton variant="neutralWeak" size="medium" onClick={() => void load()}>
          다시 시도
        </ActionButton>
      </div>
    );
  }

  return (
    <div className="px-x4 pt-x4 pb-x10">
      <LegalDocumentContent
        page={state.document.page}
        today={state.document.today}
        showTitle={false}
        renderVersionLink={(linkVersion, children) => (
          <DocumentLinkButton
            onClick={() => onOpen(linkVersion ? { document, version: linkVersion } : { document })}
          >
            {children}
          </DocumentLinkButton>
        )}
        renderDocumentLink={(target, children) => (
          <DocumentLinkButton onClick={() => onOpen(target)}>{children}</DocumentLinkButton>
        )}
      />
    </div>
  );
}

function DocumentLinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className="text-fg-neutral self-start text-left underline underline-offset-4"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
