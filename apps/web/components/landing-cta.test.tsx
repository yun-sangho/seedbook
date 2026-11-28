import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LandingCta } from "./landing-cta";

const mockSignInSocial = vi.fn();
vi.mock("@mobile/lib/auth-client", () => ({
  useSession: () => ({ data: null, isPending: false }),
  authClient: { signIn: { social: (opts: unknown) => mockSignInSocial(opts) } },
}));

describe("LandingCta", () => {
  beforeEach(() => {
    mockSignInSocial.mockReset();
    mockSignInSocial.mockResolvedValue({ data: {}, error: null });
    vi.stubGlobal("fetch", async () => Response.json({ apple: true }));
  });

  it("sends a cancelled login to the app's login screen", async () => {
    render(<LandingCta placement="header" />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /카카오로 시작/ })));
    expect(mockSignInSocial).toHaveBeenCalledWith({
      provider: "kakao",
      callbackURL: "/home?signedInWith=kakao",
      errorCallbackURL: "/home",
    });
  });

  it("starts Apple login from the hero", async () => {
    render(<LandingCta placement="hero" />);
    const apple = await screen.findByRole("button", { name: /Apple로 로그인/ });
    await act(async () => fireEvent.click(apple));
    expect(mockSignInSocial).toHaveBeenCalledWith(expect.objectContaining({ provider: "apple" }));
  });

  it("tells the visitor when the login could not start", async () => {
    mockSignInSocial.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<LandingCta placement="hero" />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /카카오로 시작/ })));
    expect(screen.getByRole("alert")).toHaveTextContent("로그인하지 못했어요");
  });
});
