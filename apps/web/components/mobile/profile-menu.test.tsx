import { fireEvent, render, screen } from "@testing-library/react";
import { usePortfolioStore } from "@web/features/portfolio/stores/portfolio-store";
import { INITIAL_PLANT_PROGRESS } from "@web/features/portfolio/types/constants";
import type { PlantStage, PortfolioItem } from "@web/features/portfolio/types/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileSheet } from "./profile-menu";

const mockUpdateUser = vi.fn();
let mockImage = "seed:sprout-2-green";
vi.mock("@seed-design/react", (importOriginal) => importOriginal());
vi.mock("@web/lib/auth-client", () => ({
  useSession: () => ({
    data: { user: { id: "u-1", name: "푸른 새싹", image: mockImage } },
  }),
  authClient: { updateUser: (body: unknown) => mockUpdateUser(body) },
}));

const STABLE = "11111111-1111-4111-8111-111111111111";
const GROWTH = "22222222-2222-4222-8222-222222222222";

function portfolio(id: string, name: string, growthStage: PlantStage): PortfolioItem {
  return {
    id,
    name,
    color: "#111",
    allocations: [],
    accountIds: [],
    driftMode: "absolute",
    driftThresholdPercent: 5,
    ...INITIAL_PLANT_PROGRESS,
    growthStage,
    note: "",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  };
}

async function savedImage(onOpenChange: ReturnType<typeof vi.fn>) {
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  return mockUpdateUser.mock.calls[0]?.[0].image;
}

describe("ProfileSheet", () => {
  beforeEach(() => {
    mockImage = "seed:sprout-2-green";
    usePortfolioStore.setState({ portfolios: [] });
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

describe("ProfileSheet avatar picker", () => {
  beforeEach(() => {
    mockImage = "seed:sprout-2-green";
    usePortfolioStore.setState({
      portfolios: [portfolio(STABLE, "안정형", 1), portfolio(GROWTH, "성장형", 3)],
    });
    mockUpdateUser.mockReset();
    mockUpdateUser.mockResolvedValue({ data: { status: true }, error: null });
  });

  it("lists auto and each plant with its stage instead of the seed reroll", () => {
    render(<ProfileSheet open onOpenChange={() => {}} />);

    expect(screen.getByRole("radio", { name: "자동 · 가장 큰 식물" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "안정형 · 새싹" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "성장형 · 나무" })).not.toBeChecked();
    expect(screen.queryByRole("button", { name: "다시 뽑기" })).not.toBeInTheDocument();
  });

  it("saves the picked plant with the original seed", async () => {
    const onOpenChange = vi.fn();
    render(<ProfileSheet open onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole("radio", { name: "안정형 · 새싹" }));

    expect(await savedImage(onOpenChange)).toBe(`plant:${STABLE}|seed:sprout-2-green`);
  });

  it("goes back to auto by dropping the plant from the image", async () => {
    mockImage = `plant:${STABLE}|seed:sprout-2-green`;
    const onOpenChange = vi.fn();
    render(<ProfileSheet open onOpenChange={onOpenChange} />);
    expect(screen.getByRole("radio", { name: "안정형 · 새싹" })).toBeChecked();

    fireEvent.click(screen.getByRole("radio", { name: "자동 · 가장 큰 식물" }));

    expect(await savedImage(onOpenChange)).toBe("seed:sprout-2-green");
  });

  it("checks auto when the picked portfolio is gone", () => {
    mockImage = "plant:33333333-3333-4333-8333-333333333333|seed:sprout-2-green";
    render(<ProfileSheet open onOpenChange={() => {}} />);

    expect(screen.getByRole("radio", { name: "자동 · 가장 큰 식물" })).toBeChecked();
  });
});
