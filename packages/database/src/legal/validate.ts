import { findMarkdownProblems } from "@seedbook/domain/legal/markdown";
import { LEGAL_DOCUMENT_IDS, type LegalDocumentVersion } from "@seedbook/domain/legal/types";

const VERSION_NAME = /^[0-9A-Za-z][0-9A-Za-z.-]*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/**
 * 공개할 버전 목록을 검사한다. 문제를 "문서@버전: 이유" 문장으로 돌려준다 (없으면 빈 배열).
 * 레포의 버전은 단위 테스트가, 공개 스크립트는 넣기 전에 이 검사를 한다.
 */
export function findVersionProblems(versions: readonly LegalDocumentVersion[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const effectiveDays = new Map<string, string>();

  const sorted = [...versions].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  const firstOf = new Map<string, LegalDocumentVersion>();
  for (const v of sorted) if (!firstOf.has(v.document)) firstOf.set(v.document, v);

  for (const v of versions) {
    const report = (problem: string) => problems.push(`${v.document}@${v.version}: ${problem}`);

    if (!(LEGAL_DOCUMENT_IDS as readonly string[]).includes(v.document)) report("모르는 문서예요");
    if (!VERSION_NAME.test(v.version)) report("버전 이름은 영문·숫자·.-만 써요");
    if (!isValidDate(v.effectiveDate)) report("시행일은 YYYY-MM-DD 예요");
    if (v.title.trim() === "") report("제목이 비어 있어요");
    for (const problem of findMarkdownProblems(v.body)) report(problem);

    const key = `${v.document}@${v.version}`;
    if (seen.has(key)) report("같은 버전이 두 번 있어요");
    seen.add(key);

    const dayKey = `${v.document}@${v.effectiveDate}`;
    const sameDay = effectiveDays.get(dayKey);
    if (sameDay !== undefined && sameDay !== v.version) {
      report(`${v.effectiveDate} 에 시행하는 버전이 이미 있어요`);
    }
    effectiveDays.set(dayKey, v.version);

    if (firstOf.get(v.document) === v) {
      if (!v.requiresConsent) report("첫 버전은 동의를 받아야 해요");
    } else if (!v.summary?.trim()) {
      report("바뀐 내용 요약이 필요해요");
    }
  }
  return problems;
}
