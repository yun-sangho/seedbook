import { INITIAL_PLANT_PROGRESS } from "@mobile/features/portfolio/types/constants";
import type { PortfolioPlantView } from "@mobile/features/portfolio/utils/portfolio-plant-view";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  EditPlantGoalSheet,
  EditPlantWishSheet,
  PlantSeasonSheet,
  PortfolioPlantRow,
  plantSeasonSheetText,
} from "./portfolio-plant-card";

function plant(partial: Partial<PortfolioPlantView> = {}): PortfolioPlantView {
  return {
    portfolioId: "p",
    name: "안정형",
    color: "#111",
    kind: "tree",
    season: 1,
    plantName: "",
    wish: "",
    wishHistory: [],
    value: 8_000_000,
    pricesComplete: true,
    stage: 1,
    goalState: "set",
    goalAmount: 10_000_000,
    finalGoalAmount: 10_000_000,
    goalPercent: 80,
    remainingToNextStage: 2_000_000,
    drifting: false,
    driftDays: 0,
    wilt: 0,
    wind: 0,
    ripe: false,
    empty: false,
    changed: false,
    rebalancing: "ok",
    ...partial,
  };
}

const actionButton = () => screen.getByRole("button", { name: /식물/ });

describe("PortfolioPlantRow", () => {
  it("shows the stage name and fills the bar toward the goal", () => {
    render(<PortfolioPlantRow plant={plant()} onAction={vi.fn()} />);
    expect(screen.getByText("새싹")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("80");
    expect(actionButton().textContent).toBe("수정");
  });

  it("uses the fern stage names", () => {
    render(<PortfolioPlantRow plant={plant({ kind: "fern", stage: 2 })} onAction={vi.fn()} />);
    expect(screen.getByText("어린 잎")).toBeTruthy();
  });

  it("offers to set the next goal after one is reached", () => {
    const onAction = vi.fn();
    render(
      <PortfolioPlantRow
        plant={plant({ goalState: "needs-goal", goalAmount: null, remainingToNextStage: null })}
        onAction={onAction}
      />
    );
    expect(screen.getByText("목표 달성!")).toBeTruthy();
    fireEvent.click(actionButton());
    expect(actionButton().textContent).toBe("목표 정하기");
    expect(onAction).toHaveBeenCalledWith("goal");
  });

  it("asks for the fruit goal once in flower", () => {
    const onAction = vi.fn();
    render(
      <PortfolioPlantRow
        plant={plant({ stage: 4, goalState: "needs-fruit-goal", goalAmount: null })}
        onAction={onAction}
      />
    );
    fireEvent.click(actionButton());
    expect(actionButton().textContent).toBe("열매 목표 정하기");
    expect(onAction).toHaveBeenCalledWith("goal");
  });

  it("points to rebalancing when the goal is reached while the weights drift", () => {
    const onAction = vi.fn();
    render(
      <PortfolioPlantRow
        plant={plant({ goalState: "blocked-by-drift", drifting: true, value: 10_000_000 })}
        onAction={onAction}
      />
    );
    expect(screen.getByText("비중을 맞추면 자라요")).toBeTruthy();
    fireEvent.click(actionButton());
    expect(actionButton().textContent).toBe("리밸런싱 보기");
    expect(onAction).toHaveBeenCalledWith("rebalance");
  });

  it("offers the harvest once the fruit is ripe", () => {
    const onAction = vi.fn();
    render(
      <PortfolioPlantRow
        plant={plant({ stage: 4, goalState: "ripe", goalAmount: null, ripe: true })}
        onAction={onAction}
      />
    );
    fireEvent.click(actionButton());
    expect(actionButton().textContent).toBe("수확하기");
    expect(onAction).toHaveBeenCalledWith("harvest");
  });

  it("shows only the ripe fruit and the harvest button once ripe", () => {
    render(
      <PortfolioPlantRow
        plant={plant({ stage: 4, goalState: "ripe", goalAmount: null, ripe: true, wish: "여행" })}
        onAction={vi.fn()}
      />
    );
    expect(screen.getByText("열매가 열렸어요")).toBeTruthy();
    expect(screen.queryByText("꽃·열매")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByRole("button", { name: /이루면/ })).toBeNull();
  });

  it("names wilting and wind", () => {
    render(<PortfolioPlantRow plant={plant({ wilt: 0.7, wind: 0.2 })} onAction={vi.fn()} />);
    expect(screen.getByText(/시들해요 · 바람이 불어요/)).toBeTruthy();
  });

  it("asks to plant a seed that has no goal yet, without a wish line", () => {
    const onAction = vi.fn();
    render(
      <PortfolioPlantRow
        plant={plant({ stage: 0, goalState: "needs-goal", goalAmount: null, empty: true })}
        onAction={onAction}
      />
    );
    expect(screen.getByText("빈 화분")).toBeTruthy();
    fireEvent.click(actionButton());
    expect(actionButton().textContent).toBe("씨앗 심기");
    expect(onAction).toHaveBeenCalledWith("season");
    expect(screen.queryByText(/이루면/)).toBeNull();
  });

  it("names the plant before its stage", () => {
    const { container } = render(
      <PortfolioPlantRow plant={plant({ plantName: "몽글이" })} onAction={vi.fn()} />
    );
    expect(container.textContent).toContain("몽글이 · 새싹");
  });

  it("opens the wish of a grown plant to change it", () => {
    const onAction = vi.fn();
    render(<PortfolioPlantRow plant={plant({ wish: "제주 여행" })} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: /이루면: 제주 여행/ }));
    expect(onAction).toHaveBeenCalledWith("wish");
  });

  it("offers to write a wish on a grown plant without one", () => {
    const onAction = vi.fn();
    render(<PortfolioPlantRow plant={plant()} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: /이루면 하고 싶은 일 적기/ }));
    expect(onAction).toHaveBeenCalledWith("wish");
  });
});

describe("EditPlantWishSheet", () => {
  const sheetProps = { open: true, onOpenChange: vi.fn() };

  it("saves the changed wish", () => {
    const onSave = vi.fn();
    render(
      <EditPlantWishSheet
        {...sheetProps}
        progress={{ wish: "제주 여행", wishHistory: [] }}
        onSave={onSave}
      />
    );
    fireEvent.change(screen.getByRole("textbox", { name: "이루면 하고 싶은 일" }), {
      target: { value: "가족 여행" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(onSave).toHaveBeenCalledWith("가족 여행");
  });

  it("lists the wishes newest first with the day each was written (KST)", () => {
    render(
      <EditPlantWishSheet
        {...sheetProps}
        progress={{
          wish: "",
          wishHistory: [
            { wish: "제주 여행", at: null },
            { wish: "가족 여행", at: "2026-11-01T16:00:00.000Z" },
            { wish: "", at: "2026-11-27T16:00:00.000Z" },
          ],
        }}
        onSave={vi.fn()}
      />
    );
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual(["2026.11.28지웠어요", "2026.11.02가족 여행", "처음제주 여행"]);
  });

  it("has no history for a plant without a wish", () => {
    render(
      <EditPlantWishSheet
        {...sheetProps}
        progress={{ wish: "", wishHistory: [] }}
        onSave={vi.fn()}
      />
    );
    expect(screen.queryByText("고친 이력")).toBeNull();
  });
});

describe("EditPlantGoalSheet", () => {
  const progress = { ...INITIAL_PLANT_PROGRESS, growthStage: 1 as const };

  it("tells the floor and refuses a goal below it", () => {
    const onSave = vi.fn();
    render(
      <EditPlantGoalSheet
        open
        onOpenChange={vi.fn()}
        progress={progress}
        valuation={{ value: 1_000_000, pricesComplete: true }}
        onSave={onSave}
      />
    );
    expect(screen.getByText(/110만원 이상으로 정할 수 있어요/)).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "목표 금액" }), {
      target: { value: "1,050,000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(screen.getByText("목표는 110만원 이상이어야 해요 (지금보다 10% 이상)")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("waits for prices before taking a goal", () => {
    render(
      <EditPlantGoalSheet
        open
        onOpenChange={vi.fn()}
        progress={progress}
        valuation={{ value: 0, pricesComplete: false }}
        onSave={vi.fn()}
      />
    );
    expect(screen.getByText(/시세를 불러오는 중이에요/)).toBeTruthy();
  });
});

describe("plantSeasonSheetText", () => {
  it("plants the first seed", () => {
    expect(plantSeasonSheetText(undefined)).toEqual({ title: "씨앗 심기" });
  });

  it("plants again right after a harvest, naming the harvested wish", () => {
    expect(plantSeasonSheetText("제주 여행")).toEqual({
      title: "다시 씨앗 심기",
      description:
        '"제주 여행" 열매를 바구니에 담았어요. 다음에 키울 식물과 하고 싶은 일을 정해요.',
    });
  });
});

describe("PlantSeasonSheet", () => {
  const seedProps = {
    open: true,
    onOpenChange: vi.fn(),
    title: "씨앗 심기",
    initialKind: "tree" as const,
    initialWish: "",
    progress: INITIAL_PLANT_PROGRESS,
  };

  it("plants a seed of the chosen kind with a goal and a wish", () => {
    const onSave = vi.fn();
    render(
      <PlantSeasonSheet
        {...seedProps}
        valuation={{ value: 1_000_000, pricesComplete: true }}
        onSave={onSave}
      />
    );
    fireEvent.click(screen.getByRole("radio", { name: "고사리" }));
    fireEvent.change(screen.getByRole("textbox", { name: "목표 금액" }), {
      target: { value: "1,100,000" },
    });
    fireEvent.change(screen.getByLabelText("식물 이름"), { target: { value: "몽글이" } });
    fireEvent.change(screen.getByLabelText("이루면 하고 싶은 일"), {
      target: { value: "부모님과 제주 여행" },
    });
    fireEvent.click(screen.getByRole("button", { name: "심기" }));
    expect(onSave).toHaveBeenCalledWith({
      plantKind: "fern",
      plantName: "몽글이",
      wish: "부모님과 제주 여행",
      goalAmount: 1_100_000,
    });
  });

  it("needs a goal at or above the floor", () => {
    const onSave = vi.fn();
    render(
      <PlantSeasonSheet
        {...seedProps}
        valuation={{ value: 1_000_000, pricesComplete: true }}
        onSave={onSave}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "심기" }));
    expect(screen.getByText("목표 금액을 1원 이상으로 입력해 주세요")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "목표 금액" }), {
      target: { value: "1,050,000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "심기" }));
    expect(screen.getByText("목표는 110만원 이상이어야 해요 (지금보다 10% 이상)")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });
});
