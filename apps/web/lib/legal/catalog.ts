import {
  LEGAL_DOCUMENT_IDS,
  type LegalDocumentId,
  type LegalDocumentVersion,
} from "@seedbook/domain/legal";

/**
 * 약관 버전 목록에서 "지금 어떤 버전인가"를 정한다. 날짜는 모두 KST 달력일(YYYY-MM-DD) 문자열이라
 * 사전순 비교가 곧 날짜 비교다. 시행일 00:00 KST 부터 그 버전이 현재 버전이다.
 */

export interface AgreedVersion {
  document: string;
  version: string;
}

export interface ConsentDocument {
  document: LegalDocumentId;
  title: string;
  version: string;
  effectiveDate: string;
  /** 전에 동의한 사용자에게 보여 줄 바뀐 내용. 처음 동의하면 null. */
  change: { summary: string | null; effectiveDate: string } | null;
}

export interface LegalNotice {
  document: LegalDocumentId;
  title: string;
  version: string;
  effectiveDate: string;
  summary: string | null;
}

/** 한 문서의 버전들, 최신(시행일이 늦은) 것부터. */
export function versionsOf(
  versions: readonly LegalDocumentVersion[],
  document: LegalDocumentId
): LegalDocumentVersion[] {
  return versions
    .filter((v) => v.document === document)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
}

function effectiveVersions(
  versions: readonly LegalDocumentVersion[],
  document: LegalDocumentId,
  today: string
): LegalDocumentVersion[] {
  return versionsOf(versions, document).filter((v) => v.effectiveDate <= today);
}

export function currentVersion(
  versions: readonly LegalDocumentVersion[],
  document: LegalDocumentId,
  today: string
): LegalDocumentVersion | null {
  return effectiveVersions(versions, document, today)[0] ?? null;
}

/** 지금 동의가 필요한 기준 버전 — 시행된 버전 중 마지막으로 재동의를 요구한 것. */
function consentBaseline(
  versions: readonly LegalDocumentVersion[],
  document: LegalDocumentId,
  today: string
): LegalDocumentVersion | null {
  return effectiveVersions(versions, document, today).find((v) => v.requiresConsent) ?? null;
}

/** 이 사용자가 동의한, 시행된 버전 중 가장 최신 것. */
function latestAgreed(
  versions: readonly LegalDocumentVersion[],
  agreed: readonly AgreedVersion[],
  document: LegalDocumentId,
  today: string
): LegalDocumentVersion | null {
  return (
    effectiveVersions(versions, document, today).find((v) =>
      agreed.some((row) => row.document === document && row.version === v.version)
    ) ?? null
  );
}

/**
 * 모든 문서에 대해, 재동의를 요구한 마지막 버전이나 그 뒤 버전에 동의했는가. 재동의가 필요 없는
 * 개정(오타 등)은 이전 동의로 충분하다. 시행된 버전이 없는 문서는 동의할 것이 없다.
 */
export function hasAgreedToCurrent(
  versions: readonly LegalDocumentVersion[],
  agreed: readonly AgreedVersion[],
  today: string
): boolean {
  return LEGAL_DOCUMENT_IDS.every((document) => {
    const baseline = consentBaseline(versions, document, today);
    if (!baseline) return true;
    const latest = latestAgreed(versions, agreed, document, today);
    return latest !== null && latest.effectiveDate >= baseline.effectiveDate;
  });
}

/** 동의 화면에 보여 줄 문서들. 동의하면 각 문서의 현재 버전을 기록한다. */
export function consentDocuments(
  versions: readonly LegalDocumentVersion[],
  agreed: readonly AgreedVersion[],
  today: string
): ConsentDocument[] {
  return LEGAL_DOCUMENT_IDS.flatMap((document) => {
    const current = currentVersion(versions, document, today);
    if (!current) return [];
    const previous = latestAgreed(versions, agreed, document, today);
    const baseline = consentBaseline(versions, document, today);
    const revised =
      previous !== null && baseline !== null && previous.effectiveDate < baseline.effectiveDate;
    return [
      {
        document,
        title: current.title,
        version: current.version,
        effectiveDate: current.effectiveDate,
        change:
          revised && baseline
            ? { summary: baseline.summary, effectiveDate: baseline.effectiveDate }
            : null,
      },
    ];
  });
}

/** 시행일 전에 앱 안에서 알릴 개정 — 재동의가 필요한 것만, 시행일 순. */
export function upcomingNotices(
  versions: readonly LegalDocumentVersion[],
  today: string
): LegalNotice[] {
  return versions
    .filter((v) => v.requiresConsent && v.effectiveDate > today)
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
    .map(({ document, title, version, effectiveDate, summary }) => ({
      document,
      title,
      version,
      effectiveDate,
      summary,
    }));
}

export interface DocumentPage {
  shown: LegalDocumentVersion;
  state: "current" | "past" | "upcoming";
  /** 지금 시행 중인 버전 (지난·예정 버전을 볼 때 돌아갈 곳). */
  current: LegalDocumentVersion | null;
  /** 현재 버전 다음에 시행할 버전. */
  next: LegalDocumentVersion | null;
  /** 모든 버전, 최신부터. */
  history: LegalDocumentVersion[];
}

/**
 * `/terms`·`/privacy` (버전 없음 → 현재 버전) 와 `/terms/<버전>` 이 보여 줄 것. 없는 버전이면 null.
 * 아직 시행된 버전이 없으면 첫 버전을 보여 준다.
 */
export function documentPage(
  versions: readonly LegalDocumentVersion[],
  document: LegalDocumentId,
  version: string | undefined,
  today: string
): DocumentPage | null {
  const history = versionsOf(versions, document);
  const current = currentVersion(versions, document, today);
  const shown =
    version === undefined
      ? (current ?? history.at(-1))
      : history.find((v) => v.version === version);
  if (!shown) return null;

  const upcoming = history.filter((v) => v.effectiveDate > today);
  let state: DocumentPage["state"] = "past";
  if (shown.effectiveDate > today) state = "upcoming";
  else if (shown === current) state = "current";

  return { shown, state, current, next: upcoming.at(-1) ?? null, history };
}
