import { CONSENT_CHECK_TIMEOUT_MS } from "@mobile/lib/consent-client";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsentGate } from "./consent-gate";

vi.mock("@mobile/lib/auth-client", () => ({
  authClient: { signOut: vi.fn(async () => ({})), deleteUser: vi.fn() },
}));

const DOCUMENTS = [
  {
    document: "terms",
    title: "이용약관",
    version: "2026-11-25",
    effectiveDate: "2026-11-25",
    change: null,
  },
  {
    document: "privacy",
    title: "개인정보처리방침",
    version: "2026-11-25",
    effectiveDate: "2026-11-25",
    change: null,
  },
];
const required = (newSignUp: boolean, documents: unknown[] = DOCUMENTS) =>
  Response.json({ agreed: false, newSignUp, documents });

/** `/api/legal/<문서>` — 문서마다 본문 한 줄. 개인정보처리방침은 이용약관 링크도 있다. */
function legalDocument(url: string) {
  const document = url.split("/").at(-1)?.split("?")[0] ?? "";
  const title = document === "terms" ? "이용약관" : "개인정보처리방침";
  const version = {
    document,
    version: "2026-11-25",
    title,
    effectiveDate: "2026-11-25",
    requiresConsent: true,
    summary: null,
    body: document === "privacy" ? `${title} 본문\n\n[약관 링크](/terms)` : `${title} 본문`,
  };
  return Response.json({
    today: "2026-11-28",
    page: { shown: version, state: "current", current: version, next: null, history: [version] },
  });
}

// 서버 경계(fetch)만 흉내 낸다.
const requests: Array<{ method: string; body: unknown }> = [];
let status: () => Response;
let submit: () => Response;

beforeEach(() => {
  requests.length = 0;
  status = () => required(true);
  submit = () => Response.json({ agreed: true });
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET" && url.startsWith("/api/legal/")) return legalDocument(url);
    if (method === "GET") return status();
    requests.push({ method, body: init?.body ? JSON.parse(String(init.body)) : null });
    return submit();
  });
});

async function open() {
  await act(async () => {
    render(
      <ConsentGate>
        <div>앱 콘텐츠</div>
      </ConsentGate>
    );
  });
}
const box = (name: RegExp) => screen.getByRole("checkbox", { name });
const agree = () => screen.getByRole("button", { name: "동의하고 계속하기" });

describe("ConsentGate", () => {
  it("opens the app when the user already agreed", async () => {
    status = () => Response.json({ agreed: true, notices: [] });
    await open();
    expect(screen.getByText("앱 콘텐츠")).toBeInTheDocument();
  });

  it("hides the app until the user agrees", async () => {
    await open();
    expect(screen.queryByText("앱 콘텐츠")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "약관에 동의해 주세요" })).toBeInTheDocument();
  });

  it.each([
    ["the server fails", () => new Response(null, { status: 500 })],
    ["the answer is malformed", () => Response.json({})],
    ["the documents are missing", () => Response.json({ agreed: false, newSignUp: true })],
    ["there is nothing to agree to", () => required(true, [])],
  ])("does not open the app when %s", async (_, response) => {
    status = response;
    await open();
    expect(screen.queryByText("앱 콘텐츠")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
  });

  it("retries after a failure", async () => {
    status = () => new Response(null, { status: 500 });
    await open();
    status = () => Response.json({ agreed: true, notices: [] });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "다시 시도" })));
    expect(screen.getByText("앱 콘텐츠")).toBeInTheDocument();
  });

  it("requires every document", async () => {
    await open();
    expect(agree()).toBeDisabled();
    fireEvent.click(box(/이용약관/));
    expect(agree()).toBeDisabled();
    fireEvent.click(box(/개인정보/));
    expect(agree()).toBeEnabled();
  });

  it("checks and unchecks everything at once", async () => {
    await open();
    fireEvent.click(box(/전체 동의/));
    expect(agree()).toBeEnabled();
    fireEvent.click(box(/이용약관/));
    expect(box(/전체 동의/)).not.toBeChecked();
    expect(agree()).toBeDisabled();
  });

  it("starts with nothing checked", async () => {
    await open();
    for (const checkbox of screen.getAllByRole("checkbox")) expect(checkbox).not.toBeChecked();
  });

  it("sends the versions that were shown", async () => {
    submit = () => new Response(null, { status: 500 });
    await open();
    fireEvent.click(box(/전체 동의/));
    await act(async () => fireEvent.click(agree()));
    expect(requests).toEqual([
      {
        method: "POST",
        body: { versions: { terms: "2026-11-25", privacy: "2026-11-25" } },
      },
    ]);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("opens each document over the consent screen instead of leaving the app", async () => {
    await open();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "개인정보처리방침 보기" }));
    });

    const viewer = screen.getByRole("dialog", { name: "개인정보처리방침" });
    expect(await within(viewer).findByText("개인정보처리방침 본문")).toBeInTheDocument();
  });

  it("opens a legal document linked from the body inside the same viewer", async () => {
    await open();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "개인정보처리방침 보기" }));
    });

    const link = await screen.findByRole("button", { name: "약관 링크" });
    await act(async () => fireEvent.click(link));

    const viewer = screen.getByRole("dialog", { name: "이용약관" });
    expect(await within(viewer).findByText("이용약관 본문")).toBeInTheDocument();
  });

  it("keeps what was checked after closing a document with the back button", async () => {
    await open();
    fireEvent.click(box(/이용약관/));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "이용약관 보기" }));
    });

    fireEvent.click(screen.getByRole("button", { name: "뒤로" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "이용약관" })).toBeNull());
    expect(box(/이용약관/)).toBeChecked();
  });

  it("closes a document on Escape (Android system back)", async () => {
    await open();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "이용약관 보기" }));
    });

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "이용약관" })).toBeNull());
  });

  it("shows an existing user what changed", async () => {
    const [terms, privacy] = DOCUMENTS;
    status = () =>
      required(false, [
        {
          ...terms,
          version: "2026-12-10",
          effectiveDate: "2026-12-10",
          change: { summary: "제5조를 바꿨어요", effectiveDate: "2026-12-10" },
        },
        privacy,
      ]);
    await open();
    expect(screen.getByRole("heading", { name: "약관이 바뀌었어요" })).toBeInTheDocument();
    expect(screen.getByText("2026년 12월 10일부터 · 제5조를 바꿨어요")).toBeInTheDocument();
  });

  it("sends the revised version", async () => {
    const [terms, privacy] = DOCUMENTS;
    status = () =>
      required(false, [
        {
          ...terms,
          version: "2026-12-10",
          change: { summary: "바뀜", effectiveDate: "2026-12-10" },
        },
        privacy,
      ]);
    submit = () => new Response(null, { status: 500 });
    await open();
    fireEvent.click(box(/전체 동의/));
    await act(async () => fireEvent.click(agree()));
    expect(requests[0]?.body).toEqual({ versions: { terms: "2026-12-10", privacy: "2026-11-25" } });
  });

  // T34: 서버가 답하지 않으면(운영 web 의 DB 커넥션 풀이 막힘) 스피너에서 영원히 머물렀다.
  it("offers a retry instead of spinning forever when the consent check never answers", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal(
        "fetch",
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_, reject) => {
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
          })
      );
      await open();
      expect(screen.getByRole("status")).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(CONSENT_CHECK_TIMEOUT_MS);
      });
      expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("warns a new user that declining removes the new account, and does nothing on cancel", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "동의하지 않기" }));
    expect(screen.getByText(/방금 만든 계정을 지워요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(requests).toEqual([]);
  });

  it("offers an existing user logout or leaving instead of deleting the account", async () => {
    status = () => required(false);
    await open();
    expect(screen.getByRole("button", { name: "회원 탈퇴" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "동의하지 않기" }));
    expect(screen.queryByText(/방금 만든 계정/)).not.toBeInTheDocument();
    expect(screen.getByText(/로그아웃/)).toBeInTheDocument();
  });
});
