"use client";

import { useMemo, useState } from "react";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import type { Stock } from "@web/features/investments/types/stock";
import { useStockPrices } from "@web/features/investments/utils/use-stock-prices";
import { usePortfolioStore } from "@web/features/portfolio/stores/portfolio-store";
import {
  candidatesFromAccount,
  candidatesFromPortfolio,
  type AllocationImportCandidate,
} from "@web/features/portfolio/utils/allocation-import-candidates";
import { ActionButton } from "@web/seed-design/ui/action-button";
import {
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetFooter,
  BottomSheetRoot,
} from "@web/seed-design/ui/bottom-sheet";
import { Checkmark } from "@web/seed-design/ui/checkbox";
import { List, ListCheckItem } from "@web/seed-design/ui/list";
import { SegmentedControl, SegmentedControlItem } from "@web/seed-design/ui/segmented-control";

type SourceKind = "account" | "portfolio";

interface SourceGroup {
  id: string;
  name: string;
  color: string;
  candidates: AllocationImportCandidate[];
}

export interface ImportedAllocation {
  stock: Stock;
  targetPercent: number;
}

/**
 * 다른 계좌 / 포트폴리오의 종목을 골라 한 번에 추가한다.
 * - 포트폴리오에서: 그 포트폴리오의 목표 비중 그대로
 * - 계좌에서: 그 계좌 안의 현재 평가 비중 (시세 없으면 0%)
 * 같은 종목은 한 출처에서만 고를 수 있다. 호출측이 `key` 로 리마운트해 선택을 초기화한다.
 */
export function ImportAllocationsSheet({
  open,
  onOpenChange,
  targetPortfolioId,
  existingKeys,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetPortfolioId: string;
  existingKeys: Set<string>;
  onImport: (items: ImportedAllocation[]) => void;
}) {
  const investments = useInvestmentStore((s) => s.investments);
  const portfolios = usePortfolioStore((s) => s.portfolios);
  const allHoldings = useMemo(
    () => investments.flatMap((inv) => inv.holdings ?? []),
    [investments]
  );
  const { prices } = useStockPrices(allHoldings);

  const accountGroups = useMemo<SourceGroup[]>(
    () =>
      investments
        .map((inv) => ({
          id: inv.id,
          name: inv.accountName || "이름 없는 계좌",
          color: inv.color,
          candidates: candidatesFromAccount(inv, prices, existingKeys),
        }))
        .filter((g) => g.candidates.length > 0),
    [investments, prices, existingKeys]
  );
  const portfolioGroups = useMemo<SourceGroup[]>(
    () =>
      portfolios
        .filter((p) => p.id !== targetPortfolioId)
        .map((p) => ({
          id: p.id,
          name: p.name,
          color: p.color,
          candidates: candidatesFromPortfolio(p, existingKeys),
        }))
        .filter((g) => g.candidates.length > 0),
    [portfolios, targetPortfolioId, existingKeys]
  );

  const [kind, setKind] = useState<SourceKind>(() =>
    accountGroups.length === 0 && portfolioGroups.length > 0 ? "portfolio" : "account"
  );
  // key = `${kind}:${sourceId}|${stockKey}` → 고른 종목
  const [selected, setSelected] = useState<Map<string, AllocationImportCandidate>>(new Map());

  const selectedStockKeys = useMemo(
    () => new Set([...selected.values()].map((c) => c.key)),
    [selected]
  );
  const groups = kind === "account" ? accountGroups : portfolioGroups;
  const hasAnySource = accountGroups.length > 0 || portfolioGroups.length > 0;

  const toggle = (selectionId: string, candidate: AllocationImportCandidate) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(selectionId)) {
        next.delete(selectionId);
      } else {
        next.set(selectionId, candidate);
      }
      return next;
    });
  };

  const submit = () => {
    onImport(
      [...selected.values()].map((c) => ({ stock: c.stock, targetPercent: c.targetPercent }))
    );
    onOpenChange(false);
  };

  return (
    <BottomSheetRoot open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent
        title="가져오기"
        description="계좌나 다른 포트폴리오의 종목을 골라 추가해요"
        showHandle
        className="!max-h-[90dvh]"
      >
        <BottomSheetBody>
          {!hasAnySource ? (
            <p className="t4-regular text-fg-neutral-subtle py-x8 text-center">
              가져올 수 있는 종목이 없어요.
            </p>
          ) : (
            <>
              <SegmentedControl
                aria-label="가져올 곳"
                value={kind}
                onValueChange={(value) => setKind(value as SourceKind)}
                className="w-full"
              >
                <SegmentedControlItem value="account">
                  계좌 {accountGroups.length}
                </SegmentedControlItem>
                <SegmentedControlItem value="portfolio">
                  포트폴리오 {portfolioGroups.length}
                </SegmentedControlItem>
              </SegmentedControl>
              <div className="mt-x3 max-h-[55dvh] min-h-[30dvh] overflow-y-auto">
                {groups.length === 0 ? (
                  <p className="t4-regular text-fg-neutral-subtle py-x8 text-center">
                    {kind === "account"
                      ? "보유 종목이 있는 계좌가 없어요."
                      : "종목이 있는 다른 포트폴리오가 없어요."}
                  </p>
                ) : (
                  groups.map((group) => (
                    <section key={group.id} className="pb-x2">
                      <div className="flex items-center gap-x2 pt-x3 pb-x1">
                        <span
                          className="size-x3 shrink-0 rounded-full"
                          style={{ backgroundColor: group.color }}
                          aria-hidden
                        />
                        <h3 className="t4-bold min-w-0 truncate">{group.name}</h3>
                      </div>
                      <List as="fieldset">
                        {group.candidates.map((c) => {
                          const selectionId = `${kind}:${group.id}|${c.key}`;
                          const checked = selected.has(selectionId);
                          // 이미 포트폴리오에 있거나, 같은 종목을 다른 출처에서 이미 골랐으면 비활성.
                          const pickedElsewhere = !checked && selectedStockKeys.has(c.key);
                          const disabled = c.alreadyAdded || pickedElsewhere;
                          return (
                            <ListCheckItem
                              key={selectionId}
                              title={c.stock.name || c.stock.ticker}
                              detail={candidateDetail(c, pickedElsewhere)}
                              suffix={<Checkmark tone="neutral" size="large" />}
                              checked={checked}
                              onCheckedChange={() => toggle(selectionId, c)}
                              disabled={disabled}
                            />
                          );
                        })}
                      </List>
                    </section>
                  ))
                )}
              </div>
            </>
          )}
        </BottomSheetBody>
        <BottomSheetFooter>
          <ActionButton
            size="large"
            className="w-full"
            disabled={selected.size === 0}
            onClick={submit}
          >
            {selected.size > 0 ? `${selected.size}개 추가` : "종목을 선택하세요"}
          </ActionButton>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheetRoot>
  );
}

function candidateDetail(c: AllocationImportCandidate, pickedElsewhere: boolean): string {
  if (c.alreadyAdded) return `${c.stock.ticker} · 이미 추가됨`;
  if (pickedElsewhere) return `${c.stock.ticker} · 다른 곳에서 선택됨`;
  return `${c.stock.ticker} · 비중 ${c.targetPercent}%`;
}
