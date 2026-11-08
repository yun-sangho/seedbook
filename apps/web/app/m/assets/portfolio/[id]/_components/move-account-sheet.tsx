"use client";

import { ActionButton } from "@web/seed-design/ui/action-button";
import {
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetFooter,
  BottomSheetRoot,
} from "@web/seed-design/ui/bottom-sheet";

export interface AccountMove {
  accountId: string;
  accountName: string;
  fromPortfolioName: string;
}

/**
 * 다른 포트폴리오에 연결된 계좌를 이 포트폴리오로 옮기기 전에 확인한다.
 * 한 계좌는 하나의 포트폴리오에만 연결되므로, 옮기면 기존 연결이 풀린다.
 */
export function MoveAccountSheet({
  move,
  toPortfolioName,
  onConfirm,
  onClose,
}: {
  move: AccountMove | null;
  toPortfolioName: string;
  onConfirm: (accountId: string) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheetRoot open={move !== null} onOpenChange={(open) => !open && onClose()}>
      <BottomSheetContent title="정말 이동하시겠습니까?" showHandle>
        <BottomSheetBody>
          {move && (
            <p className="t4-regular text-fg-neutral-subtle">
              <span className="text-fg-neutral font-bold">{move.accountName}</span>은(는) 지금{" "}
              <span className="text-fg-neutral font-bold">{move.fromPortfolioName}</span>에 연결돼
              있어요. {toPortfolioName || "이 포트폴리오"}(으)로 옮기면 {move.fromPortfolioName}와의
              연결은 해제돼요.
            </p>
          )}
        </BottomSheetBody>
        <BottomSheetFooter>
          <div className="flex w-full gap-x2">
            <ActionButton variant="neutralWeak" size="large" flexGrow onClick={onClose}>
              취소
            </ActionButton>
            <ActionButton
              size="large"
              flexGrow
              onClick={() => {
                if (move) onConfirm(move.accountId);
                onClose();
              }}
            >
              이동
            </ActionButton>
          </div>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheetRoot>
  );
}
