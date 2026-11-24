import { act, fireEvent, render, screen } from "@testing-library/react";
import { LEGAL_DOCUMENTS } from "@web/lib/legal-documents";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsentGate } from "./consent-gate";

vi.mock("@web/lib/auth-client", () => ({
  authClient: { signOut: vi.fn(async () => ({})), deleteUser: vi.fn() },
}));

// 서버 경계(fetch)만 흉내 낸다.
const requests: Array<{ method: string; body: unknown }> = [];
let status: () => Response;
let submit: () => Response;

beforeEach(() => {
  requests.length = 0;
  status = () => Response.json({ agreed: false, newSignUp: true });
  submit = () => Response.json({ agreed: true });
  vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
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
    status = () => Response.json({ agreed: true });
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
  ])("does not open the app when %s", async (_, response) => {
    status = response;
    await open();
    expect(screen.queryByText("앱 콘텐츠")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
  });

  it("retries after a failure", async () => {
    status = () => new Response(null, { status: 500 });
    await open();
    status = () => Response.json({ agreed: true });
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
        body: { versions: Object.fromEntries(LEGAL_DOCUMENTS.map((d) => [d.id, d.version])) },
      },
    ]);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("links to each document", async () => {
    await open();
    for (const { title, href } of LEGAL_DOCUMENTS) {
      expect(screen.getByRole("link", { name: `${title} 보기` })).toHaveAttribute("href", href);
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
    status = () => Response.json({ agreed: false, newSignUp: false });
    await open();
    expect(screen.getByRole("button", { name: "회원 탈퇴" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "동의하지 않기" }));
    expect(screen.queryByText(/방금 만든 계정/)).not.toBeInTheDocument();
    expect(screen.getByText(/로그아웃/)).toBeInTheDocument();
  });
});
