"use client";

import { useMemo, useState } from "react";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { stockPriceKey, useStockPrices } from "@web/features/investments/utils/use-stock-prices";
import { usePortfolioStore } from "@web/features/portfolio/stores/portfolio-store";
import { useRebalancingStore } from "@web/features/rebalancing/stores/rebalancing-store";
import type { RebalancingSession, RebalancingTask } from "@web/features/rebalancing/types/types";
import {
  applyRebalancingToAccount,
  type CashChange,
  type HoldingChange,
} from "@web/features/rebalancing/utils/apply-rebalancing-to-account";
import { formatQuantityChange } from "@web/features/rebalancing/utils/format-quantity-change";
import { computeRebalancingResult } from "@web/features/rebalancing/utils/rebalancing-result";
import { ActionButton } from "@web/seed-design/ui/action-button";
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
 * 리밸런싱을 완료하는 확인 시트. 반영되는 종목별 수량 변화(전 → 후, 증감)와 예수금 변화만
 * 보여준다 — 최종 비중은 완료한 뒤 리밸런싱 화면의 "리밸런싱 결과" 에서 본다.
 * "계좌에 반영하기"(기본 체크)를 켜 두면 매매한 수량과 예수금 변화를 계좌에 반영하고,
 * 반영 후 포트폴리오 구성을 기록에 남긴다.
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

  // 결과 비중의 가격: 이번에 매매한 종목은 리밸런싱 기준 가격, 나머지는 지금 시세.
  const { prices: livePrices } = useStockPrices(preview?.account.holdings ?? []);

  const canApply = preview !== null;
  const uncheckedCount = session.tasks.filter((t) => !t.done).length;
  // 남은 매매가 있으면 "완료"가 아니라 "중지"다.
  const stopping = uncheckedCount > 0;
  const willApply = canApply && applyToAccount;

  const submit = () => {
    if (willApply && preview) {
      replaceInvestment(preview.account);
      const prices = new Map<string, number>();
      for (const [key, point] of livePrices) prices.set(key, point.close);
      for (const task of session.tasks) {
        if (task.price !== null) prices.set(stockPriceKey(task.market, task.ticker), task.price);
      }
      const result = portfolio
        ? computeRebalancingResult(
            preview.account,
            portfolio.allocations,
            prices,
            preview.holdingChanges
          )
        : null;
      completeRebalancing(session.id, result);
    } else {
      completeRebalancing(session.id);
    }
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
              description={`남은 매매 ${uncheckedCount}건은 하지 않은 것으로 기록되고, 계좌에도 반영되지 않아요.`}
              className="mb-x4"
            />
          )}
          {preview ? (
            <>
              <Checkbox
                label="계좌에 반영하기"
                checked={applyToAccount}
                onCheckedChange={setApplyToAccount}
                size="large"
                tone="neutral"
              />
              {applyToAccount ? (
                <ApplyPreview holdingChanges={preview.holdingChanges} cash={preview.cash} />
              ) : (
                <p className="t4-regular text-fg-neutral-muted mt-x2">
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
            <p className="t4-regular text-fg-neutral-muted">
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

/**
 * 계좌에 반영될 종목별 수량 변화와 예수금 변화. 반영되는 종목은 모두 보여주고, 길어지면
 * 이 목록만 스크롤된다. 종목명이 잘리지 않게 두 줄 (위: 이름 · 증감, 아래: 전 → 후).
 */
function ApplyPreview({
  holdingChanges,
  cash,
}: {
  holdingChanges: HoldingChange[];
  cash: CashChange;
}) {
  const cashChanged = cash.before !== cash.after;
  if (holdingChanges.length === 0 && !cashChanged) {
    return <p className="t4-regular text-fg-neutral-muted mt-x2">계좌에 반영할 매매가 없어요.</p>;
  }
  return (
    <ul className="divide-stroke-neutral-subtle mt-x2 max-h-[45dvh] divide-y overflow-y-auto">
      {holdingChanges.map((change) => {
        const delta = change.after - change.before;
        return (
          <ChangeRow
            key={change.task.id}
            label={change.task.name || change.task.ticker}
            aside={
              <span className={delta > 0 ? "text-fg-positive" : "text-fg-critical"}>
                {formatQuantityChange(delta)}
              </span>
            }
            before={`${formatWithCommas(change.before)}주`}
            after={`${formatWithCommas(change.after)}주`}
          />
        );
      })}
      {cashChanged && (
        <ChangeRow
          label={cash.label}
          before={`${formatWithCommas(cash.before)}원`}
          after={`${formatWithCommas(cash.after)}원`}
        />
      )}
    </ul>
  );
}

function ChangeRow({
  label,
  aside,
  before,
  after,
}: {
  label: string;
  aside?: React.ReactNode;
  before: string;
  after: string;
}) {
  return (
    <li className="py-x2">
      <div className="flex items-baseline gap-x3">
        <span className="t4-medium min-w-0 flex-1 break-keep">{label}</span>
        {aside && <span className="t4-bold shrink-0 tabular-nums">{aside}</span>}
      </div>
      <p className="t3-regular text-fg-neutral-muted mt-[2px] tabular-nums">
        {before} → <span className="text-fg-neutral font-bold">{after}</span>
      </p>
    </li>
  );
}
