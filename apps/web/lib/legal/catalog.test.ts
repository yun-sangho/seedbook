import type { LegalDocumentVersion } from "@seedbook/domain/legal";
import { describe, expect, it } from "vitest";
import {
  consentDocuments,
  currentVersion,
  documentPage,
  hasAgreedToCurrent,
  upcomingNotices,
  versionsOf,
} from "./catalog";

function version(
  document: LegalDocumentVersion["document"],
  effectiveDate: string,
  overrides: Partial<LegalDocumentVersion> = {}
): LegalDocumentVersion {
  return {
    document,
    version: effectiveDate,
    title: document === "terms" ? "이용약관" : "개인정보처리방침",
    effectiveDate,
    requiresConsent: true,
    summary: null,
    body: "본문",
    ...overrides,
  };
}

const FIRST = [version("terms", "2026-11-25"), version("privacy", "2026-11-25")];
const agreedTo = (...rows: Array<[string, string]>) =>
  rows.map(([document, version]) => ({ document, version }));

describe("currentVersion", () => {
  it("is the latest version already in effect", () => {
    const versions = [...FIRST, version("terms", "2026-12-10"), version("terms", "2027-01-01")];

    expect(currentVersion(versions, "terms", "2026-12-31")?.version).toBe("2026-12-10");
  });

  it("switches at the start of the effective date (KST day)", () => {
    const versions = [...FIRST, version("terms", "2026-12-10")];

    expect(currentVersion(versions, "terms", "2026-12-09")?.version).toBe("2026-11-25");
    expect(currentVersion(versions, "terms", "2026-12-10")?.version).toBe("2026-12-10");
  });

  it("is null before the first version takes effect", () => {
    expect(currentVersion(FIRST, "terms", "2026-11-24")).toBeNull();
  });
});

describe("versionsOf", () => {
  it("lists one document's versions, newest first", () => {
    const versions = [...FIRST, version("terms", "2027-01-01"), version("terms", "2026-12-10")];

    expect(versionsOf(versions, "terms").map((v) => v.version)).toEqual([
      "2027-01-01",
      "2026-12-10",
      "2026-11-25",
    ]);
  });
});

describe("hasAgreedToCurrent", () => {
  it("is false without any consent", () => {
    expect(hasAgreedToCurrent(FIRST, [], "2026-11-26")).toBe(false);
  });

  it("is true when every current document is agreed", () => {
    const agreed = agreedTo(["terms", "2026-11-25"], ["privacy", "2026-11-25"]);

    expect(hasAgreedToCurrent(FIRST, agreed, "2026-11-26")).toBe(true);
  });

  it("is false when one document is missing", () => {
    expect(hasAgreedToCurrent(FIRST, agreedTo(["terms", "2026-11-25"]), "2026-11-26")).toBe(false);
  });

  it("keeps the old consent until a revision that needs consent takes effect", () => {
    const versions = [...FIRST, version("terms", "2026-12-10")];
    const agreed = agreedTo(["terms", "2026-11-25"], ["privacy", "2026-11-25"]);

    expect(hasAgreedToCurrent(versions, agreed, "2026-12-09")).toBe(true);
    expect(hasAgreedToCurrent(versions, agreed, "2026-12-10")).toBe(false);
  });

  it("keeps the old consent through a revision that needs no consent", () => {
    const versions = [...FIRST, version("terms", "2026-12-10", { requiresConsent: false })];
    const agreed = agreedTo(["terms", "2026-11-25"], ["privacy", "2026-11-25"]);

    expect(hasAgreedToCurrent(versions, agreed, "2026-12-31")).toBe(true);
  });

  it("accepts consent to a later version than the one that needed it", () => {
    const versions = [
      ...FIRST,
      version("terms", "2026-12-10"),
      version("terms", "2026-12-20", { requiresConsent: false }),
    ];
    const agreed = agreedTo(["terms", "2026-12-20"], ["privacy", "2026-11-25"]);

    expect(hasAgreedToCurrent(versions, agreed, "2026-12-31")).toBe(true);
  });

  it("ignores consent to a version it does not know", () => {
    const agreed = agreedTo(["terms", "2099-01-01"], ["privacy", "2026-11-25"]);

    expect(hasAgreedToCurrent(FIRST, agreed, "2026-11-26")).toBe(false);
  });
});

describe("consentDocuments", () => {
  it("asks for the current version of every document", () => {
    const versions = [...FIRST, version("terms", "2027-01-01")];

    expect(
      consentDocuments(versions, [], "2026-11-26").map((d) => [d.document, d.version])
    ).toEqual([
      ["terms", "2026-11-25"],
      ["privacy", "2026-11-25"],
    ]);
  });

  it("shows no change for a first consent", () => {
    expect(consentDocuments(FIRST, [], "2026-11-26").every((d) => d.change === null)).toBe(true);
  });

  it("shows what changed in a revised document", () => {
    const versions = [...FIRST, version("terms", "2026-12-10", { summary: "제5조를 바꿨어요" })];
    const agreed = agreedTo(["terms", "2026-11-25"], ["privacy", "2026-11-25"]);

    const [terms, privacy] = consentDocuments(versions, agreed, "2026-12-10");

    expect(terms?.change).toEqual({ summary: "제5조를 바꿨어요", effectiveDate: "2026-12-10" });
    expect(privacy?.change).toBeNull();
  });

  it("shows the revision that needs consent even when a minor one came after", () => {
    const versions = [
      ...FIRST,
      version("terms", "2026-12-10", { summary: "제5조를 바꿨어요" }),
      version("terms", "2026-12-20", { requiresConsent: false, summary: "오타 수정" }),
    ];
    const agreed = agreedTo(["terms", "2026-11-25"], ["privacy", "2026-11-25"]);

    const [terms] = consentDocuments(versions, agreed, "2026-12-31");

    expect(terms?.version).toBe("2026-12-20");
    expect(terms?.change).toEqual({ summary: "제5조를 바꿨어요", effectiveDate: "2026-12-10" });
  });
});

describe("upcomingNotices", () => {
  it("announces revisions that need consent before they take effect", () => {
    const versions = [
      ...FIRST,
      version("terms", "2026-12-10", { summary: "제5조를 바꿨어요" }),
      version("privacy", "2026-12-20", { requiresConsent: false }),
    ];

    expect(upcomingNotices(versions, "2026-12-03")).toEqual([
      {
        document: "terms",
        title: "이용약관",
        version: "2026-12-10",
        effectiveDate: "2026-12-10",
        summary: "제5조를 바꿨어요",
      },
    ]);
  });

  it("stops announcing on the effective date", () => {
    const versions = [...FIRST, version("terms", "2026-12-10")];

    expect(upcomingNotices(versions, "2026-12-10")).toEqual([]);
  });
});

describe("documentPage", () => {
  const versions = [
    ...FIRST,
    version("terms", "2026-12-10", { summary: "제5조를 바꿨어요" }),
    version("terms", "2027-01-01", { summary: "제6조를 바꿨어요" }),
  ];

  it("shows the current version and what comes next", () => {
    const page = documentPage(versions, "terms", undefined, "2026-12-20");

    expect(page?.shown.version).toBe("2026-12-10");
    expect(page?.state).toBe("current");
    expect(page?.next?.version).toBe("2027-01-01");
  });

  it("shows a past version and points to the current one", () => {
    const page = documentPage(versions, "terms", "2026-11-25", "2026-12-20");

    expect(page?.state).toBe("past");
    expect(page?.current?.version).toBe("2026-12-10");
  });

  it("shows an upcoming version", () => {
    expect(documentPage(versions, "terms", "2027-01-01", "2026-12-20")?.state).toBe("upcoming");
  });

  it("lists every version, newest first", () => {
    expect(
      documentPage(versions, "terms", undefined, "2026-12-20")?.history.map((v) => v.version)
    ).toEqual(["2027-01-01", "2026-12-10", "2026-11-25"]);
  });

  it("is null for a version that does not exist", () => {
    expect(documentPage(versions, "terms", "1999-01-01", "2026-12-20")).toBeNull();
  });

  it("shows the first version before anything took effect", () => {
    const page = documentPage(versions, "terms", undefined, "2026-11-01");

    expect(page?.shown.version).toBe("2026-11-25");
    expect(page?.state).toBe("upcoming");
  });
});
