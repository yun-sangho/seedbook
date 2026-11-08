import { fireEvent, render, screen } from "@testing-library/react";
import type { DebtsItem } from "@web/features/debts/types/types";
import { describe, expect, it, vi } from "vitest";
import { DebtItemComponent } from "./debt-item";

function debt(overrides: Partial<DebtsItem> = {}): DebtsItem {
  return {
    id: "debt-1",
    loanName: "신용대출 1",
    loanType: "신용대출",
    lender: "",
    amount: 5_000,
    interestRate: 5,
    maturityDate: "",
    monthlyPayment: 5_000,
    note: "",
    ...overrides,
  };
}

/**
 * 금액 입력은 쉼표가 들어간 값("5,000")을 보여준다. 사용자가 그 뒤에 숫자를 이어 치면
 * onChange 로 "5,0000" 이 들어오는데, 이를 쉼표에서 끊어 5 로 읽으면 네 자리 이상을
 * 입력할 수 없다 (5,000,000 을 치면 500 이 저장되던 버그).
 */
describe("DebtItemComponent amount inputs", () => {
  it("reads a comma-formatted loan amount as the full number", () => {
    const onUpdateDebt = vi.fn();
    render(<DebtItemComponent item={debt()} onUpdateDebt={onUpdateDebt} onRemoveDebt={vi.fn()} />);

    fireEvent.change(screen.getByDisplayValue("5,000"), { target: { value: "5,0000" } });

    expect(onUpdateDebt).toHaveBeenCalledWith("debt-1", "amount", 50_000);
  });

  it("reads a comma-formatted monthly payment as the full number", () => {
    const onUpdateDebt = vi.fn();
    render(
      <DebtItemComponent
        item={debt({ amount: 0 })}
        onUpdateDebt={onUpdateDebt}
        onRemoveDebt={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "상세 보기" }));

    fireEvent.change(screen.getByDisplayValue("5,000"), { target: { value: "5,0000" } });

    expect(onUpdateDebt).toHaveBeenCalledWith("debt-1", "monthlyPayment", 50_000);
  });

  it("stores 0 when the amount is cleared", () => {
    const onUpdateDebt = vi.fn();
    render(<DebtItemComponent item={debt()} onUpdateDebt={onUpdateDebt} onRemoveDebt={vi.fn()} />);

    fireEvent.change(screen.getByDisplayValue("5,000"), { target: { value: "" } });

    expect(onUpdateDebt).toHaveBeenCalledWith("debt-1", "amount", 0);
  });
});
