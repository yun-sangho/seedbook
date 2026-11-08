"use client";

import { useMemo, useState } from "react";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { usePortfolioStore } from "@web/features/portfolio/stores/portfolio-store";
import { useRebalancingStore } from "@web/features/rebalancing/stores/rebalancing-store";
import type { RebalancingSession, RebalancingTask } from "@web/features/rebalancing/types/types";
import { applyRebalancingToAccount } from "@web/features/rebalancing/utils/apply-rebalancing-to-account";
import { ActionButton } from "@web/seed-design/ui/action-button";
import { Badge } from "@web/seed-design/ui/badge";
import {
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetFooter,
  BottomSheetRoot,
} from "@web/seed-design/ui/bottom-sheet";
import { Callout } from "@web/seed-design/ui/callout";
import { Checkbox } from "@web/seed-design/ui/checkbox";
import { formatWithCommas } from "@web/utils/number-format";

/** 포트폴리오에서 통화를 찾지 못한 새 보유 종목의 통화 — 지금은 국내 주식만 다룬다. */
const FALLBACK_CURRENCY = "KRW";

/**
 * 할 일을 모두 마친 리밸런싱을 완료하는 시트. "계좌에 반영하기"(기본 체크)를 켜 두면
 * 매매한 수량과 예수금 변화를 계좌에 함께 반영한다.
 */
export function CompleteRebalancingSheet({
  session,
  open,
  onOpenChange,
}: {
  session: RebalancingSession;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const account = useInvestmentStore((s) =>
    s.investments.find((inv) => inv.id === session.accountId)
  );
  const replaceInvestment = useInvestmentStore((s) => s.replaceInvestment);
  const portfolio = usePortfolioStore((s) =>
    s.portfolios.find((p) => p.id === session.portfolioId)
  );
  const completeRebalancing = useRebalancingStore((s) => s.completeRebalancing);
  const [applyToAccount, setApplyToAccount] = useState(true);

  // 미리보기와 실제 반영에 같은 계산을 쓴다.
  const preview = useMemo(() => {
    if (!account) return null;
    const currencyFor = (task: RebalancingTask) =>
      portfolio?.allocations.find((a) => a.id === task.id)?.currency || FALLBACK_CURRENCY;
    return applyRebalancingToAccount(account, session, currencyFor);
  }, [account, portfolio, session]);

  const canApply = preview !== null;
  const uncheckedCount = session.tasks.filter((t) => !t.done).length;
  // 남은 매매가 있으면 "완료"가 아니라 "중지"다.
  const stopping = uncheckedCount > 0;
  const willApply = canApply && applyToAccount;

  const submit = () => {
    if (willApply && preview) replaceInvestment(preview.account);
    completeRebalancing(session.id);
    onOpenChange(false);
  };

  return (
    <BottomSheetRoot open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent
        title={stopping ? "리밸런싱을 중지할까요?" : "리밸런싱을 완료할까요?"}
        showHandle
      >
        <BottomSheetBody>
          {stopping && (
            <Callout
              tone="warning"
              title="아직 모든 매매가 완료되지 않았어요"
              description={`남은 매매 ${uncheckedCount}건은 하지 않은 것으로 기록되고, 계좌에도 반영되지 않아요.`}
              className="mb-x4"
            />
          )}
          {canApply ? (
            <>
              <Checkbox
                label="계좌에 반영하기"
                checked={applyToAccount}
                onCheckedChange={setApplyToAccount}
                size="large"
                tone="neutral"
              />
              {applyToAccount ? (
                <ul className="mt-x3 max-h-[45dvh] overflow-y-auto">
                  {preview.holdingChanges.map((change) => (
                    <ChangeRow
                      key={change.task.id}
                      label={
                        <>
                          <Badge
                            tone={change.task.action === "매수" ? "positive" : "critical"}
                            variant="weak"
                          >
                            {change.task.action}
                          </Badge>
                          <span className="truncate">{change.task.name || change.task.ticker}</span>
                        </>
                      }
                      before={`${formatWithCommas(change.before)}주`}
                      after={`${formatWithCommas(change.after)}주`}
                    />
                  ))}
                  <ChangeRow
                    label={<span className="truncate">{preview.cash.label}</span>}
                    before={`${formatWithCommas(preview.cash.before)}원`}
                    after={`${formatWithCommas(preview.cash.after)}원`}
                  />
                </ul>
              ) : (
                <p className="t3-regular text-fg-neutral-subtle mt-x2">
                  계좌는 그대로 두고 기록만 남겨요.
                </p>
              )}
              {applyToAccount && preview.skipped.length > 0 && (
                <p className="t3-regular text-fg-warning mt-x2">
                  {preview.skipped.map((t) => t.name || t.ticker).join(", ")}
                  은(는) 예상 수량이 없거나 보유하지 않은 종목이라 반영하지 않아요.
                </p>
              )}
            </>
          ) : (
            <p className="t3-regular text-fg-neutral-subtle">
              계좌가 삭제되어 반영할 수 없어요. 기록만 남겨요.
            </p>
          )}
        </BottomSheetBody>
        <BottomSheetFooter>
          <ActionButton size="large" className="w-full" onClick={submit}>
            {stopping ? "중지" : "완료"}
          </ActionButton>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheetRoot>
  );
}

/** 반영 전 → 후 한 줄. 바뀌는 값(후)을 굵게 보여 준다. */
function ChangeRow({
  label,
  before,
  after,
}: {
  label: React.ReactNode;
  before: string;
  after: string;
}) {
  return (
    <li className="flex items-center gap-x3 py-x2">
      <span className="t4-regular flex min-w-0 flex-1 items-center gap-x2">{label}</span>
      <span className="t4-regular shrink-0 tabular-nums">
        <span className="text-fg-neutral-subtle">{before} → </span>
        <span className="font-bold">{after}</span>
      </span>
    </li>
  );
}
