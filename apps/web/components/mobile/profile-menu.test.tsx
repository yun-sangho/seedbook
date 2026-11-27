import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileSheet } from "./profile-menu";

const mockUpdateUser = vi.fn();
vi.mock("@seed-design/react", (importOriginal) => importOriginal());
vi.mock("@web/lib/auth-client", () => ({
  useSession: () => ({
    data: { user: { id: "u-1", name: "푸른 새싹", image: "seed:sprout-2-green" } },
  }),
  authClient: { updateUser: (body: unknown) => mockUpdateUser(body) },
}));

describe("ProfileSheet", () => {
  beforeEach(() => {
    mockUpdateUser.mockReset();
    mockUpdateUser.mockResolvedValue({ data: { status: true }, error: null });
  });

  it("starts from the current nickname with saving disabled", () => {
    render(<ProfileSheet open onOpenChange={() => {}} />);

    expect(screen.getByLabelText("닉네임")).toHaveValue("푸른 새싹");
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
  });

  it("draws a different avatar but keeps the nickname", async () => {
    const onOpenChange = vi.fn();
    render(<ProfileSheet open onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole("button", { name: "다시 뽑기" }));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const [body] = mockUpdateUser.mock.calls[0] ?? [];
    expect(body.name).toBe("푸른 새싹");
    expect(body.image).toMatch(/^seed:/);
    expect(body.image).not.toBe("seed:sprout-2-green");
  });

  it("shows why a banned nickname is not saved", async () => {
    render(<ProfileSheet open onOpenChange={() => {}} />);

    fireEvent.change(screen.getByLabelText("닉네임"), { target: { value: "시드북 관리자" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText("쓸 수 없는 단어가 들어 있어요")).toBeInTheDocument();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
});
