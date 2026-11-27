import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { BottomActionSlotContext } from "@web/components/mobile/bottom-action";
import type { DeleteAccountResult } from "@web/lib/delete-account";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteAccountMobile } from "./delete-account-mobile";

const mocks = vi.hoisted(() => ({
  confirmDelete: vi.fn(),
  signOutToReauthenticate: vi.fn(),
  outcome: null as DeleteAccountResult | null,
}));

vi.mock("@seed-design/react", (importOriginal) => importOriginal());
vi.mock("@web/components/mobile/profile-menu", () => ({
  useSessionUser: () => ({ id: "u-1", name: "푸른 새싹", image: null }),
}));
vi.mock("@web/hooks/use-delete-account", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@web/hooks/use-delete-account")>()),
  useDeleteAccount: () => ({
    pending: false,
    outcome: mocks.outcome,
    confirmDelete: mocks.confirmDelete,
    signOutToReauthenticate: mocks.signOutToReauthenticate,
    reset: () => {},
  }),
}));

function Screen() {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return (
    <BottomActionSlotContext.Provider value={slot}>
      <DeleteAccountMobile />
      <div ref={setSlot} />
    </BottomActionSlotContext.Provider>
  );
}

describe("DeleteAccountMobile", () => {
  beforeEach(() => {
    mocks.confirmDelete.mockReset();
    mocks.signOutToReauthenticate.mockReset();
    mocks.outcome = null;
  });

  it("keeps 탈퇴하기 disabled until the notice is confirmed", () => {
    render(<Screen />);

    expect(screen.getByText("푸른 새싹님, 탈퇴하기 전에 확인해 주세요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "탈퇴하기" })).toBeDisabled();
  });

  it("deletes the account after the notice is confirmed", () => {
    render(<Screen />);

    fireEvent.click(screen.getByLabelText("안내 내용을 확인했어요"));
    fireEvent.click(screen.getByRole("button", { name: "탈퇴하기" }));

    expect(mocks.confirmDelete).toHaveBeenCalledTimes(1);
  });

  it("asks to sign in again when the session is too old", () => {
    mocks.outcome = "reauth-required";
    render(<Screen />);

    fireEvent.click(screen.getByRole("button", { name: "다시 로그인" }));

    expect(screen.queryByRole("button", { name: "탈퇴하기" })).toBeNull();
    expect(mocks.signOutToReauthenticate).toHaveBeenCalled();
  });
});
