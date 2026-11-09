"use client";

import { useMemo, useState } from "react";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { stockPriceKey, useStockPrices } from "@web/features/investments/utils/use-stock-prices";
import { usePortfolioStore } from "@web/features/portfolio/stores/portfolio-store";
import { useRebalancingStore } from "@web/features/rebalancing/stores/rebalancing-store";
import type { RebalancingSession, RebalancingTask } from "@web/features/rebalancing/types/types";
import { applyRebalancingToAccount } from "@web/features/rebalancing/utils/apply-rebalancing-to-account";
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
 * 리밸런싱을 완료하는 확인 시트. 무엇이 반영되는지 한두 줄로만 요약한다 — 종목별 결과는
 * 완료한 뒤 리밸런싱 화면의 "리밸런싱 결과" 에서 본다.
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
              <p className="t4-regular text-fg-neutral-muted mt-x2">
                {applyToAccount
                  ? applySummary(preview.holdingChanges.map((c) => c.task))
                  : "계좌는 그대로 두고 기록만 남겨요."}
              </p>
              {applyToAccount && preview.cash.before !== preview.cash.after && (
                <p className="t4-regular text-fg-neutral-muted mt-x1 tabular-nums">
                  {preview.cash.label} {formatWithCommas(preview.cash.before)}원 →{" "}
                  <span className="text-fg-neutral font-bold">
                    {formatWithCommas(preview.cash.after)}원
                  </span>
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

/** "매도 2건 · 매수 3건을 계좌에 반영해요" — 반영할 매매가 없으면 그렇다고 알린다. */
function applySummary(tasks: RebalancingTask[]): string {
  const sells = tasks.filter((t) => t.action === "매도").length;
  const buys = tasks.length - sells;
  const parts = [sells > 0 ? `매도 ${sells}건` : null, buys > 0 ? `매수 ${buys}건` : null];
  const label = parts.filter(Boolean).join(" · ");
  return label ? `${label}을 계좌에 반영해요.` : "계좌에 반영할 매매가 없어요.";
}
