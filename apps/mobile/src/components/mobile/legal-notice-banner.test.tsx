import { ConsentGate } from "@mobile/components/consent-gate";
import type { LegalNotice } from "@mobile/lib/legal/catalog";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LegalNoticeBanner } from "./legal-notice-banner";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("@stackflow/react", () => ({ useFlow: () => ({ push: mocks.push }) }));

vi.mock("@mobile/lib/auth-client", () => ({
  authClient: { signOut: vi.fn(async () => ({})), deleteUser: vi.fn() },
}));

const TERMS: LegalNotice = {
  document: "terms",
  title: "이용약관",
  version: "2026-12-10",
  effectiveDate: "2026-12-10",
  summary: "제5조를 바꿨어요",
};

let notices: unknown;

beforeEach(() => {
  window.localStorage.clear();
  mocks.push.mockClear();
  notices = [TERMS];
  vi.stubGlobal("fetch", async () => Response.json({ agreed: true, notices }));
});

// 안내는 동의 확인 응답(ConsentGate)에서 온다.
async function open() {
  await act(async () => {
    render(
      <ConsentGate>
        <LegalNoticeBanner />
      </ConsentGate>
    );
  });
}

describe("LegalNoticeBanner", () => {
  it("announces a revision with its effective date and summary", async () => {
    await open();
    expect(screen.getByText("이용약관이 바뀌어요")).toBeInTheDocument();
    expect(screen.getByText("2026년 12월 10일부터 · 제5조를 바꿨어요")).toBeInTheDocument();
  });

  it("shows nothing without a revision", async () => {
    notices = [];
    await open();
    expect(screen.queryByText(/바뀌어요/)).not.toBeInTheDocument();
  });

  it("shows nothing when the notices are malformed", async () => {
    notices = "nope";
    await open();
    expect(screen.queryByText(/바뀌어요/)).not.toBeInTheDocument();
  });

  it("stays hidden on this device once dismissed", async () => {
    await open();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "닫기" })));
    expect(screen.queryByText("이용약관이 바뀌어요")).not.toBeInTheDocument();

    await open();
    expect(screen.queryByText("이용약관이 바뀌어요")).not.toBeInTheDocument();
  });

  it("announces a newer revision even after an older one was dismissed", async () => {
    await open();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "닫기" })));

    notices = [{ ...TERMS, version: "2027-01-01", effectiveDate: "2027-01-01" }];
    await open();
    expect(screen.getByText("이용약관이 바뀌어요")).toBeInTheDocument();
  });

  it("opens the revised version inside the app instead of the site page", async () => {
    await open();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "자세히 보기" })));

    expect(mocks.push).toHaveBeenCalledWith("Terms", { version: "2026-12-10" });
  });

  it("opens a privacy policy revision on the privacy screen", async () => {
    notices = [{ ...TERMS, document: "privacy", title: "개인정보처리방침" }];
    await open();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "자세히 보기" })));

    expect(mocks.push).toHaveBeenCalledWith("Privacy", { version: "2026-12-10" });
  });
});
