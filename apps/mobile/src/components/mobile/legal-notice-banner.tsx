"use client";

import { useState } from "react";
import { IconDocumentLine } from "@karrotmarket/react-monochrome-icon";
import { legalActivityOf } from "@mobile/app/_stack/legal-activity";
import { useLegalNotices } from "@mobile/components/consent-gate";
import { getDeviceStorage } from "@mobile/lib/device-storage";
import type { LegalNotice } from "@mobile/lib/legal/catalog";
import { koreanDate } from "@mobile/lib/legal-documents";
import { DismissibleCallout } from "@mobile/seed-design/ui/callout";
import { useFlow } from "@stackflow/react";

/** 이 기기에서 닫은 안내 ("문서@버전" 목록). 계정 데이터가 아니라 화면 편의라 기기 저장소에 둔다. */
const DISMISSED_KEY = "seedbook.legal-notice.dismissed";

function readDismissed(): string[] {
  try {
    const parsed: unknown = JSON.parse(getDeviceStorage().getItem(DISMISSED_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

const keyOf = (notice: LegalNotice) => `${notice.document}@${notice.version}`;

/** 받침이 있으면 "이", 없으면 "가". */
function subjectParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 === 0 ? "가" : "이";
}

/**
 * 홈 위에 시행일 전 약관 개정을 알린다. 닫으면 그 버전은 이 기기에서 다시 보이지 않는다.
 * "자세히 보기" 는 사이트 페이지로 나가지 않고 그 버전을 앱 안 문서 화면(설정의 약관 화면)으로 연다.
 */
export function LegalNoticeBanner() {
  const notices = useLegalNotices();
  const { push } = useFlow();
  const [dismissed, setDismissed] = useState(readDismissed);

  const visible = notices.filter((notice) => !dismissed.includes(keyOf(notice)));
  if (visible.length === 0) return null;

  const dismiss = (notice: LegalNotice) => {
    // 지금 안내 중인 것만 남겨 목록이 끝없이 자라지 않게 한다.
    const next = [...dismissed, keyOf(notice)].filter((key) =>
      notices.some((current) => keyOf(current) === key)
    );
    setDismissed(next);
    getDeviceStorage().setItem(DISMISSED_KEY, JSON.stringify(next));
  };

  return (
    <div className="flex flex-col gap-x2 px-x4 pt-x4">
      {visible.map((notice) => (
        <DismissibleCallout
          key={keyOf(notice)}
          tone="informative"
          prefixIcon={<IconDocumentLine />}
          title={`${notice.title}${subjectParticle(notice.title)} 바뀌어요`}
          description={[`${koreanDate(notice.effectiveDate)}부터`, notice.summary]
            .filter(Boolean)
            .join(" · ")}
          linkProps={{
            children: "자세히 보기",
            onClick: () => push(legalActivityOf(notice.document), { version: notice.version }),
          }}
          onDismiss={() => dismiss(notice)}
        />
      ))}
    </div>
  );
}
