"use client";

import { useEffect, useState } from "react";
import {
  IconMagnifyingglassLine,
  IconPlusLine,
  IconXmarkLine,
} from "@karrotmarket/react-monochrome-icon";
import { PrefixIcon } from "@seed-design/react";
import { StockSearchSheet } from "@web/features/investments/components/stock-search-sheet";
import type { Stock } from "@web/features/investments/types/stock";
import { ActionButton } from "@web/seed-design/ui/action-button";
import { TextField, TextFieldInput } from "@web/seed-design/ui/text-field";
import { SEED_PRESET_DISCLAIMER } from "../types/seed-presets";
import {
  addSeedStock,
  parsePercentDraft,
  pickedStockKeys,
  removeSeedStock,
  type SeedDraft,
  type SeedGroup,
  type SeedStocksIssue,
  seedStocksIssue,
  setSeedGroupPercent,
  splitPercentEvenly,
  stockKey,
} from "../utils/onboarding-flow";
import { OnboardingStepLayout } from "./onboarding-step-layout";

const formatPercent = (value: number) => `${Number(value.toFixed(1))}%`;

function issueMessage(result: SeedStocksIssue): string | null {
  switch (result.issue) {
    case null:
      return null;
    case "empty":
      return "종목을 하나 이상 담아 주세요";
    case "group-without-stock":
      return `${result.group}에 종목을 담거나 비중을 0% 로 해 주세요`;
    case "total-not-100":
      return `비중 합이 ${formatPercent(result.totalPercent)}예요. 100% 가 되게 맞춰 주세요`;
  }
}

/** 비중 입력. 입력 중인 글자("7.")는 그대로 두고, 값이 밖에서 바뀌면(고르게 나누기) 따라간다. */
function PercentInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText((current) => (parsePercentDraft(current) === value ? current : String(value)));
  }, [value]);

  return (
    <div className="w-[104px] shrink-0">
      <TextField
        value={text}
        suffix="%"
        aria-label={`${label} 비중`}
        onValueChange={({ value: next }) => {
          setText(next);
          const parsed = parsePercentDraft(next);
          if (parsed !== null) onChange(parsed);
        }}
      >
        <TextFieldInput inputMode="decimal" aria-label={`${label} 비중`} />
      </TextField>
    </div>
  );
}

function PickedStockRow({
  stock,
  share,
  onRemove,
}: {
  stock: Stock;
  share: number | null;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center gap-x2 py-x2">
      <span className="t4-medium min-w-0 flex-1 truncate">{stock.name}</span>
      {share !== null && (
        <span className="t3-regular text-fg-neutral-subtle shrink-0">{formatPercent(share)}</span>
      )}
      <button
        type="button"
        aria-label={`${stock.name} 빼기`}
        onClick={onRemove}
        className="text-fg-neutral-subtle -mr-x1 flex size-x8 shrink-0 items-center justify-center rounded-full"
      >
        <IconXmarkLine width={16} height={16} />
      </button>
    </li>
  );
}

function AssetClassCard({
  group,
  picked,
  onPercent,
  onAdd,
  onRemove,
  onSearch,
}: {
  group: SeedGroup;
  picked: Set<string>;
  onPercent: (value: number) => void;
  onAdd: (stock: Stock) => void;
  onRemove: (stock: Stock) => void;
  onSearch: () => void;
}) {
  const shares = splitPercentEvenly(group.percent, group.stocks.length);
  const examples = group.examples.filter((e) => !picked.has(stockKey(e)));
  return (
    <section
      aria-label={group.label}
      className="border-stroke-neutral-muted flex flex-col gap-x3 rounded-r3 border p-x4"
    >
      <div className="flex items-center gap-x3">
        <h2 className="t5-bold flex-1">{group.label}</h2>
        <PercentInput label={group.label} value={group.percent} onChange={onPercent} />
      </div>
      {group.stocks.length > 0 && (
        <ul className="flex flex-col">
          {group.stocks.map((stock, i) => (
            <PickedStockRow
              key={stockKey(stock)}
              stock={stock}
              share={group.stocks.length > 1 ? (shares[i] ?? null) : null}
              onRemove={() => onRemove(stock)}
            />
          ))}
        </ul>
      )}
      {examples.length > 0 && (
        <div className="flex flex-col gap-x2">
          <span className="t3-regular text-fg-neutral-subtle">예시 (눌러서 담기)</span>
          <div className="flex flex-wrap gap-x2">
            {examples.map((example) => (
              <ActionButton
                key={stockKey(example)}
                variant="neutralWeak"
                size="xsmall"
                onClick={() => onAdd(example)}
              >
                <PrefixIcon svg={<IconPlusLine />} />
                {example.name}
              </ActionButton>
            ))}
          </div>
        </div>
      )}
      <ActionButton variant="neutralOutline" size="small" onClick={onSearch}>
        <PrefixIcon svg={<IconMagnifyingglassLine />} />
        검색해서 담기
      </ActionButton>
    </section>
  );
}

/** 자산군마다 종목을 담고 비중을 고친다 (합 100%). 직접 만들기는 종목마다 비중을 정한다. */
export function StocksStep({
  draft,
  onChange,
  onBack,
  onNext,
  onLater,
}: {
  draft: SeedDraft;
  onChange: (draft: SeedDraft) => void;
  onBack: () => void;
  onNext: () => void;
  onLater: () => void;
}) {
  /** 검색해서 담을 묶음. 직접 만들기는 null (새 묶음), 시트가 닫혀 있으면 undefined. */
  const [searchTarget, setSearchTarget] = useState<string | null | undefined>(undefined);
  const picked = pickedStockKeys(draft);
  const status = seedStocksIssue(draft);
  const message = issueMessage(status);
  const custom = draft.presetId === null;

  return (
    <OnboardingStepLayout
      progress={4}
      title={custom ? "종목을 담고 비중을 정해 주세요" : "자산군마다 종목을 담아 주세요"}
      description={
        custom
          ? "검색해서 담으면 비중을 똑같이 나눠 드려요. 숫자를 눌러 고칠 수 있어요."
          : "비중은 자산군 단위예요. 한 자산군에 종목을 여럿 담으면 똑같이 나눠요."
      }
      onBack={onBack}
      primary={{ label: "씨앗 심기", disabled: status.issue !== null, onClick: onNext }}
      onLater={onLater}
      footerNote={
        <p
          aria-live="polite"
          className={`t3-medium pb-x1 text-center break-keep ${
            message ? "text-fg-warning" : "text-fg-positive"
          }`}
        >
          {message ?? `비중 합 ${formatPercent(status.totalPercent)}`}
        </p>
      }
    >
      <p className="t3-regular text-fg-neutral-subtle break-keep">{SEED_PRESET_DISCLAIMER}</p>

      {custom ? (
        <div className="flex flex-col gap-x3">
          {draft.groups.length > 0 && (
            <ul className="flex flex-col gap-x2">
              {draft.groups.map((group) => (
                <li key={group.id} className="flex items-center gap-x2">
                  <span className="t4-medium min-w-0 flex-1 truncate">{group.label}</span>
                  <PercentInput
                    label={group.label}
                    value={group.percent}
                    onChange={(value) => onChange(setSeedGroupPercent(draft, group.id, value))}
                  />
                  <button
                    type="button"
                    aria-label={`${group.label} 빼기`}
                    onClick={() => {
                      const [stock] = group.stocks;
                      if (stock) onChange(removeSeedStock(draft, group.id, stock));
                    }}
                    className="text-fg-neutral-subtle flex size-x8 shrink-0 items-center justify-center rounded-full"
                  >
                    <IconXmarkLine width={16} height={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <ActionButton variant="neutralWeak" size="medium" onClick={() => setSearchTarget(null)}>
            <PrefixIcon svg={<IconMagnifyingglassLine />} />
            종목 검색해서 담기
          </ActionButton>
        </div>
      ) : (
        <div className="flex flex-col gap-x3">
          {draft.groups.map((group) => (
            <AssetClassCard
              key={group.id}
              group={group}
              picked={picked}
              onPercent={(value) => onChange(setSeedGroupPercent(draft, group.id, value))}
              onAdd={(stock) => onChange(addSeedStock(draft, group.id, stock))}
              onRemove={(stock) => onChange(removeSeedStock(draft, group.id, stock))}
              onSearch={() => setSearchTarget(group.id)}
            />
          ))}
        </div>
      )}

      <StockSearchSheet
        open={searchTarget !== undefined}
        onOpenChange={(open) => {
          if (!open) setSearchTarget(undefined);
        }}
        disabledKeys={picked}
        title={
          searchTarget
            ? `${draft.groups.find((g) => g.id === searchTarget)?.label ?? ""} 종목 검색`
            : "종목 검색"
        }
        onSelect={(stock) => {
          if (searchTarget !== undefined) onChange(addSeedStock(draft, searchTarget, stock));
        }}
      />
    </OnboardingStepLayout>
  );
}
