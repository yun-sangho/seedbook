"use client";

import { useMemo, useState } from "react";
import { IconPlusLine } from "@karrotmarket/react-monochrome-icon";
import { Divider, Icon } from "@seed-design/react";
import { sanitizePercentDraft } from "@web/components/mobile/input-format";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { ACCOUNT_COLORS } from "@web/features/investments/types/constants";
import { usePortfolioStore } from "@web/features/portfolio/stores/portfolio-store";
import type { PortfolioItem } from "@web/features/portfolio/types/types";
import { validateAllocations } from "@web/features/portfolio/utils/validate-allocations";
import { cn } from "@web/lib/utils";
import { ActionButton } from "@web/seed-design/ui/action-button";
import { Badge } from "@web/seed-design/ui/badge";
import { Callout } from "@web/seed-design/ui/callout";
import { Checkmark } from "@web/seed-design/ui/checkbox";
import { List, ListButtonItem, ListCheckItem } from "@web/seed-design/ui/list";
import { TextField, TextFieldInput, TextFieldTextarea } from "@web/seed-design/ui/text-field";
import { parseNumericString } from "@web/utils/number-format";
import { AddAllocationFlow, EditAllocationSheet } from "./allocation-sheets";

/** 카드 대신 디바이더로 구분되는 섹션. 첫 섹션은 탭 경계와 겹치지 않게 디바이더를 생략. */
function Section({
  title,
  meta,
  first = false,
  children,
}: {
  title: string;
  meta?: React.ReactNode;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      {!first && <Divider />}
      <section className="py-x4">
        <div className="flex items-baseline gap-x2 px-x4 pb-x2">
          <h2 className="t5-bold">{title}</h2>
          {meta && <div className="ml-auto">{meta}</div>}
        </div>
        {children}
      </section>
    </>
  );
}

export function PortfolioEditorMobile({
  portfolio,
  readOnly,
}: {
  portfolio: PortfolioItem;
  readOnly: boolean;
}) {
  const updatePortfolio = usePortfolioStore((s) => s.updatePortfolio);
  const addAllocation = usePortfolioStore((s) => s.addAllocation);
  const updateAllocation = usePortfolioStore((s) => s.updateAllocation);
  const removeAllocation = usePortfolioStore((s) => s.removeAllocation);
  const toggleAccountLink = usePortfolioStore((s) => s.toggleAccountLink);
  const setDriftThreshold = usePortfolioStore((s) => s.setDriftThreshold);
  const investments = useInvestmentStore((s) => s.investments);

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [driftDraft, setDriftDraft] = useState(String(portfolio.driftThresholdPercent));

  const validation = useMemo(
    () => validateAllocations(portfolio.allocations),
    [portfolio.allocations]
  );
  const usedKeys = useMemo(
    () =>
      new Set(
        portfolio.allocations
          .filter((a) => a.market && a.ticker)
          .map((a) => `${a.market}:${a.ticker}`)
      ),
    [portfolio.allocations]
  );
  const linkedIds = useMemo(() => new Set(portfolio.accountIds), [portfolio.accountIds]);

  const totalPct = validation.totalPercent;
  const isOver = totalPct > 100;
  const isUnder = totalPct < 100 && portfolio.allocations.length > 0;
  const editing = portfolio.allocations.find((a) => a.id === editingId);

  return (
    <div>
      <Section title="기본 정보" first>
        <div className="flex flex-col gap-x5 px-x4">
          <TextField
            label="이름"
            value={portfolio.name}
            onValueChange={({ value }) => updatePortfolio(portfolio.id, "name", value)}
            readOnly={readOnly}
          >
            <TextFieldInput placeholder="포트폴리오 이름" />
          </TextField>
          <div>
            <p className="t4-medium mb-x2">색상</p>
            <div className="flex flex-wrap gap-x2">
              {ACCOUNT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  disabled={readOnly}
                  aria-label={`색상 ${color}`}
                  aria-pressed={portfolio.color === color}
                  onClick={() => updatePortfolio(portfolio.id, "color", color)}
                  className={cn(
                    "size-x8 rounded-full border-2",
                    portfolio.color === color
                      ? "border-stroke-neutral-contrast"
                      : "border-transparent"
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="종목 비중"
        meta={
          <span
            className={cn(
              "t4-bold tabular-nums",
              isOver ? "text-fg-critical" : isUnder ? "text-fg-warning" : "text-fg-positive"
            )}
          >
            {totalPct.toFixed(1)}% / 100%
          </span>
        }
      >
        <div className="px-x4 pb-x2">
          <div className="bg-bg-neutral-weak h-x2 w-full overflow-hidden rounded-full">
            <div
              className={cn(
                "h-full transition-all",
                isOver
                  ? "bg-bg-critical-solid"
                  : isUnder
                    ? "bg-bg-warning-solid"
                    : "bg-bg-positive-solid"
              )}
              style={{ width: `${Math.min(100, totalPct)}%` }}
            />
          </div>
        </div>

        {portfolio.allocations.length === 0 ? (
          <p className="t4-regular text-fg-neutral-subtle px-x4 py-x2">
            아직 추가된 종목이 없습니다.
          </p>
        ) : (
          <List>
            {portfolio.allocations.map((a) => (
              <ListButtonItem
                key={a.id}
                title={a.name || "(종목 미선택)"}
                detail={a.market && a.ticker ? `${a.market} · ${a.ticker}` : undefined}
                suffix={<span className="t5-bold tabular-nums">{a.targetPercent}%</span>}
                disabled={readOnly}
                onClick={() => setEditingId(a.id)}
              />
            ))}
          </List>
        )}

        {validation.code !== "OK" && (
          <div className="px-x4 pt-x2">
            <Callout
              tone={validation.code === "UNDER_100" ? "warning" : "critical"}
              description={validation.message}
            />
          </div>
        )}

        {!readOnly && (
          <div className="px-x4 pt-x3">
            <ActionButton
              variant="neutralWeak"
              size="medium"
              className="w-full"
              onClick={() => setAdding(true)}
            >
              <Icon svg={<IconPlusLine />} />
              종목 추가
            </ActionButton>
          </div>
        )}
      </Section>

      <Section
        title="적용 계좌"
        meta={
          <span className="t3-regular text-fg-neutral-subtle">
            {portfolio.accountIds.length === 0
              ? "연결 없음"
              : `${portfolio.accountIds.length}개 연결`}
          </span>
        }
      >
        {investments.length === 0 ? (
          <p className="t4-regular text-fg-neutral-subtle px-x4">
            투자 계좌를 먼저 추가한 뒤 연결할 수 있습니다.
          </p>
        ) : (
          <List as="fieldset">
            {investments.map((inv) => (
              <ListCheckItem
                key={inv.id}
                title={inv.accountName || "이름 없는 계좌"}
                prefix={
                  <span
                    className="size-x3 block rounded-full"
                    style={{ backgroundColor: inv.color }}
                    aria-hidden
                  />
                }
                suffix={
                  <div className="flex items-center gap-x2">
                    {inv.accountType && <Badge variant="weak">{inv.accountType}</Badge>}
                    <Checkmark tone="neutral" size="large" />
                  </div>
                }
                checked={linkedIds.has(inv.id)}
                onCheckedChange={() => toggleAccountLink(portfolio.id, inv.id)}
                disabled={readOnly}
              />
            ))}
          </List>
        )}
      </Section>

      <Section title="경고 · 메모">
        <div className="flex flex-col gap-x5 px-x4">
          <TextField
            label="이격률 경고 임계"
            value={driftDraft}
            onValueChange={({ value }) => {
              const next = sanitizePercentDraft(value);
              setDriftDraft(next);
              const num = parseNumericString(next);
              setDriftThreshold(portfolio.id, Number.isFinite(num) ? num : 0);
            }}
            suffix="%"
            description="목표 대비 차이가 이 값보다 크면 경고합니다"
            readOnly={readOnly}
          >
            <TextFieldInput inputMode="decimal" />
          </TextField>
          <TextField
            label="메모"
            value={portfolio.note}
            onValueChange={({ value }) => updatePortfolio(portfolio.id, "note", value)}
            readOnly={readOnly}
          >
            <TextFieldTextarea placeholder="리밸런싱 기준, 매매 규칙 등을 기록" />
          </TextField>
        </div>
      </Section>

      {!readOnly && (
        <>
          <AddAllocationFlow
            open={adding}
            onOpenChange={setAdding}
            disabledKeys={usedKeys}
            remainingPercent={100 - totalPct}
            onAdd={(stock, targetPercent) =>
              addAllocation(portfolio.id, {
                market: stock.market,
                ticker: stock.ticker,
                name: stock.name,
                currency: stock.currency,
                targetPercent,
              })
            }
          />
          {editing && (
            <EditAllocationSheet
              key={editing.id}
              open
              onOpenChange={(next) => !next && setEditingId(null)}
              allocation={editing}
              remainingPercent={100 - totalPct}
              onSave={(percent) =>
                updateAllocation(portfolio.id, editing.id, "targetPercent", percent)
              }
              onDelete={() => removeAllocation(portfolio.id, editing.id)}
            />
          )}
        </>
      )}
    </div>
  );
}
