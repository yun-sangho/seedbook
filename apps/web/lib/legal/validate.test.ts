import { findVersionProblems } from "@seedbook/database/legal/validate";
import { LEGAL_DOCUMENT_VERSIONS, type LegalDocumentVersion } from "@seedbook/domain/legal";
import { describe, expect, it } from "vitest";

function version(overrides: Partial<LegalDocumentVersion> = {}): LegalDocumentVersion {
  return {
    document: "terms",
    version: "2026-11-25",
    title: "이용약관",
    effectiveDate: "2026-11-25",
    requiresConsent: true,
    summary: null,
    body: "## 1. 목적\n\n본문",
    ...overrides,
  };
}

const revision = (overrides: Partial<LegalDocumentVersion> = {}) =>
  version({ version: "2026-12-10", effectiveDate: "2026-12-10", summary: "바뀜", ...overrides });

describe("the versions in the repo", () => {
  it("have no problems", () => {
    expect(findVersionProblems(LEGAL_DOCUMENT_VERSIONS)).toEqual([]);
  });

  it("start with the versions users have already agreed to", () => {
    // 배포 전 동의 기록(user_consent)이 가리키는 버전. 바뀌면 모든 사용자가 다시 동의해야 한다.
    const first = (document: string) =>
      LEGAL_DOCUMENT_VERSIONS.filter((v) => v.document === document).sort((a, b) =>
        a.effectiveDate.localeCompare(b.effectiveDate)
      )[0];
    expect([first("terms")?.version, first("privacy")?.version]).toEqual([
      "2026-11-25",
      "2026-11-25",
    ]);
  });
});

describe("the latest version of each document", () => {
  const latest = (document: string) =>
    LEGAL_DOCUMENT_VERSIONS.filter((v) => v.document === document)
      .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
      .at(-1);

  it.each(["terms", "privacy"])(
    "%s points account deletion at the current screen (설정 → 탈퇴하기)",
    (document) => {
      const body = latest(document)?.body ?? "";
      // 더보기 탭은 #86 에서 없어졌다. 탈퇴는 설정 메뉴의 "탈퇴하기" 다.
      expect(body).not.toContain("더보기");
      expect(body).toContain("설정의 “탈퇴하기”");
    }
  );

  it.each(["terms", "privacy"])("%s states its own effective date in the body", (document) => {
    const version = latest(document);
    const [year, month, day] = (version?.effectiveDate ?? "").split("-").map(Number);
    expect(version?.body).toContain(`${year}년 ${month}월 ${day}일부터 시행합니다`);
  });
});

describe("findVersionProblems", () => {
  it("accepts a first version and a summarized revision", () => {
    expect(findVersionProblems([version(), revision()])).toEqual([]);
  });

  it("rejects an unknown document", () => {
    const unknown = { ...version(), document: "refund" } as unknown as LegalDocumentVersion;

    expect(findVersionProblems([unknown])).toEqual(["refund@2026-11-25: 모르는 문서예요"]);
  });

  it.each([
    [
      "a version that does not fit in a URL",
      { version: "v 1/2" },
      "버전 이름은 영문·숫자·.-만 써요",
    ],
    ["an invalid effective date", { effectiveDate: "2026-13-01" }, "시행일은 YYYY-MM-DD 예요"],
    ["an empty title", { title: " " }, "제목이 비어 있어요"],
    ["HTML in the body", { body: "<p>본문</p>" }, "HTML 은 쓸 수 없어요: <p>"],
  ])("rejects %s", (_, overrides: Partial<LegalDocumentVersion>, problem) => {
    expect(findVersionProblems([version(overrides)])).toContain(
      `terms@${overrides.version ?? "2026-11-25"}: ${problem}`
    );
  });

  it("rejects the same version twice", () => {
    expect(findVersionProblems([version(), version({ effectiveDate: "2026-12-01" })])).toContain(
      "terms@2026-11-25: 같은 버전이 두 번 있어요"
    );
  });

  it("rejects two versions taking effect on the same day", () => {
    expect(findVersionProblems([version(), revision({ effectiveDate: "2026-11-25" })])).toContain(
      "terms@2026-12-10: 2026-11-25 에 시행하는 버전이 이미 있어요"
    );
  });

  it("requires consent to the first version", () => {
    expect(findVersionProblems([version({ requiresConsent: false })])).toEqual([
      "terms@2026-11-25: 첫 버전은 동의를 받아야 해요",
    ]);
  });

  it("requires a summary for a revision", () => {
    expect(findVersionProblems([version(), revision({ summary: null })])).toEqual([
      "terms@2026-12-10: 바뀐 내용 요약이 필요해요",
    ]);
  });
});
