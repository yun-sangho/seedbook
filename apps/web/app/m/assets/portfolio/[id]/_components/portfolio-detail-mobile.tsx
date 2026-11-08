"use client";

import { Fragment, useMemo, useState, type CSSProperties } from "react";
import { IconArrowDownHorizlineLine, IconPlusLine } from "@karrotmarket/react-monochrome-icon";
import { Icon } from "@seed-design/react";
import { useFlow } from "@stackflow/react";
import { usePopThenRemove } from "@web/app/m/_stack/use-pop-then-remove";
import {
  EditHint,
  EmptyLine,
  InlineAmount,
  TabToolbar,
} from "@web/components/mobile/detail-layout";
import { HeaderAction } from "@web/components/mobile/header-action";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { usePortfolioStore } from "@web/features/portfolio/stores/portfolio-store";
import type { PortfolioItem } from "@web/features/portfolio/types/types";
import { accountPortfolioMap } from "@web/features/portfolio/utils/portfolio-links";
import { validateAllocations } from "@web/features/portfolio/utils/validate-allocations";
import { useIsReadOnly } from "@web/features/sharing/hooks/use-is-read-only";
import { cn } from "@web/lib/utils";
import { ActionButton } from "@web/seed-design/ui/action-button";
import { Badge } from "@web/seed-design/ui/badge";
import { Callout } from "@web/seed-design/ui/callout";
import { Checkmark } from "@web/seed-design/ui/checkbox";
import {
  ChipTabsContent,
  ChipTabsList,
  ChipTabsRoot,
  ChipTabsTrigger,
} from "@web/seed-design/ui/chip-tabs";
import { List, ListButtonItem, ListCheckItem, ListDivider } from "@web/seed-design/ui/list";
import { ResultSection } from "@web/seed-design/ui/result-section";
import { TextField, TextFieldTextarea } from "@web/seed-design/ui/text-field";
import { AddAllocationFlow, EditAllocationSheet } from "./allocation-sheets";
import { ImportAllocationsSheet } from "./import-allocations-sheet";
import { EditDriftThresholdSheet, PortfolioSettingsSheet } from "./portfolio-edit-sheets";

type Tab = "allocations" | "accounts" | "memo";

type Editing =
  | { kind: "settings" }
  | { kind: "drift" }
  | { kind: "add-allocation" }
  | { kind: "import-allocations" }
  | { kind: "allocation"; id: string };

// 종목 행: 계좌 상세의 보유 종목 행과 같은 여백.
const ROW_STYLE: CSSProperties = {
  paddingTop: "var(--seed-dimension-x4)",
  paddingBottom: "var(--seed-dimension-x4)",
};
const ROW_DIVIDER_STYLE: CSSProperties = {
  marginLeft: "var(--seed-dimension-x4)",
  marginRight: "var(--seed-dimension-x4)",
};

/** 합계 상태별 색 (초과 critical / 미달 warning / 100% positive). */
function totalTone(totalPct: number, hasAllocations: boolean) {
  if (totalPct > 100) return { text: "text-fg-critical", bar: "bg-bg-critical-solid" };
  if (totalPct < 100 && hasAllocations) {
    return { text: "text-fg-warning", bar: "bg-bg-warning-solid" };
  }
  return { text: "text-fg-positive", bar: "bg-bg-positive-solid" };
}

/** 모바일 포트폴리오 상세 (`/assets/portfolio/[id]`). 계좌 상세와 같은 레이아웃. */
export function PortfolioDetailMobile({ id }: { id: string }) {
  const portfolio = usePortfolioStore((s) => s.portfolios.find((p) => p.id === id));
  const { pop } = useFlow();

  if (!portfolio) {
    return (
      <div className="flex min-h-[60dvh] flex-col">
        <ResultSection
          title="포트폴리오를 찾을 수 없어요"
          description="삭제되었거나 잘못된 링크일 수 있습니다."
          primaryActionProps={{
            children: "돌아가기",
            onClick: () => pop(),
          }}
        />
      </div>
    );
  }

  return <PortfolioDetailBody portfolio={portfolio} />;
}

function PortfolioDetailBody({ portfolio }: { portfolio: PortfolioItem }) {
  const readOnly = useIsReadOnly();
  const [tab, setTab] = useState<Tab>("allocations");
  const [editing, setEditing] = useState<Editing | null>(null);

  const updatePortfolio = usePortfolioStore((s) => s.updatePortfolio);
  const removePortfolio = usePortfolioStore((s) => s.removePortfolio);
  const deletePortfolio = usePopThenRemove(() => removePortfolio(portfolio.id));
  const addAllocation = usePortfolioStore((s) => s.addAllocation);
  const updateAllocation = usePortfolioStore((s) => s.updateAllocation);
  const removeAllocation = usePortfolioStore((s) => s.removeAllocation);
  const toggleAccountLink = usePortfolioStore((s) => s.toggleAccountLink);
  const setDriftThreshold = usePortfolioStore((s) => s.setDriftThreshold);
  const investments = useInvestmentStore((s) => s.investments);
  const portfolios = usePortfolioStore((s) => s.portfolios);
  // 한 계좌는 하나의 포트폴리오에만 연결된다 — 다른 포트폴리오에 연결된 계좌는 체크하면 옮겨온다.
  const portfolioByAccount = useMemo(() => accountPortfolioMap(portfolios), [portfolios]);

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
  const linkedCount = investments.filter((inv) => linkedIds.has(inv.id)).length;

  const totalPct = validation.totalPercent;
  const tone = totalTone(totalPct, portfolio.allocations.length > 0);
  const editingAllocation =
    editing?.kind === "allocation"
      ? portfolio.allocations.find((a) => a.id === editing.id)
      : undefined;

  const close = () => setEditing(null);
  const sheetProps = (open: boolean) => ({
    open,
    onOpenChange: (next: boolean) => !next && close(),
  });

  return (
    <div className="pb-x4">
      <section className="px-x4 pt-x4 pb-x3">
        <p className="t3-medium text-fg-neutral-muted">목표 비중 합계</p>
        <p className={cn("t9-bold tabular-nums", tone.text)}>{totalPct.toFixed(1)}%</p>
        <div className="bg-bg-neutral-weak mt-x2 h-x2 w-full overflow-hidden rounded-full">
          <div
            className={cn("h-full transition-all", tone.bar)}
            style={{ width: `${Math.min(100, totalPct)}%` }}
          />
        </div>
        <div className="border-stroke-neutral-muted rounded-r3 mt-x3 flex flex-col gap-y-x3 border-2 px-x4 py-x3">
          <InlineAmount
            label="이격 경고"
            value={`${portfolio.driftThresholdPercent}% 초과 시`}
            onEdit={readOnly ? undefined : () => setEditing({ kind: "drift" })}
          />
        </div>
      </section>

      <ChipTabsRoot
        value={tab}
        onValueChange={(value) => setTab(value as Tab)}
        variant="neutralSolid"
        size="medium"
      >
        <div className="pt-x3">
          <ChipTabsList>
            <ChipTabsTrigger value="allocations">
              종목 비중 {portfolio.allocations.length}
            </ChipTabsTrigger>
            <ChipTabsTrigger value="accounts">적용 계좌 {linkedCount}</ChipTabsTrigger>
            <ChipTabsTrigger value="memo">메모</ChipTabsTrigger>
          </ChipTabsList>
        </div>

        <ChipTabsContent value="allocations">
          <TabToolbar
            meta={
              portfolio.allocations.length > 0
                ? `${portfolio.allocations.length}종목 · 남은 비중 ${Math.max(0, 100 - totalPct).toFixed(1)}%`
                : undefined
            }
          />
          {validation.code !== "OK" && portfolio.allocations.length > 0 && (
            <div className="px-x4 pb-x2">
              <Callout
                tone={validation.code === "UNDER_100" ? "warning" : "critical"}
                description={validation.message}
              />
            </div>
          )}
          {portfolio.allocations.length === 0 ? (
            <EmptyLine>아직 추가된 종목이 없습니다.</EmptyLine>
          ) : (
            <List>
              {portfolio.allocations.map((a, index) => (
                <Fragment key={a.id}>
                  {index > 0 && <ListDivider style={ROW_DIVIDER_STYLE} />}
                  <ListButtonItem
                    title={<span className="t5-medium">{a.name || "(종목 미선택)"}</span>}
                    detail={
                      <span className="t4-regular text-fg-neutral-muted mt-[2px] inline-flex items-center gap-x1">
                        {a.market && a.ticker ? `${a.market} · ${a.ticker}` : "종목 미선택"}
                        {!readOnly && <EditHint />}
                      </span>
                    }
                    suffix={
                      <span className="t5-bold text-fg-neutral tabular-nums">
                        {a.targetPercent}%
                      </span>
                    }
                    alignItems="center"
                    rootProps={{ style: ROW_STYLE }}
                    disabled={readOnly}
                    aria-label={`${a.name || "종목"} 비중 수정`}
                    onClick={() => setEditing({ kind: "allocation", id: a.id })}
                  />
                </Fragment>
              ))}
            </List>
          )}
          {/* 종목 추가는 목록 맨 아래에 둔다 (계좌 상세와 같은 흐름). 검색 또는 계좌·포트폴리오에서 가져오기. */}
          {!readOnly && (
            <div className="flex justify-center gap-x2 pt-x2">
              <ActionButton
                variant="ghost"
                size="medium"
                onClick={() => setEditing({ kind: "add-allocation" })}
              >
                <Icon svg={<IconPlusLine />} />
                종목 추가
              </ActionButton>
              <ActionButton
                variant="ghost"
                size="medium"
                onClick={() => setEditing({ kind: "import-allocations" })}
              >
                <Icon svg={<IconArrowDownHorizlineLine />} />
                가져오기
              </ActionButton>
            </div>
          )}
        </ChipTabsContent>

        <ChipTabsContent value="accounts">
          <TabToolbar
            meta={
              investments.length > 0
                ? `${investments.length}개 중 ${linkedCount}개 연결 · 체크하면 이 비중으로 리밸런싱`
                : undefined
            }
          />
          {investments.length === 0 ? (
            <EmptyLine>투자 계좌를 먼저 추가한 뒤 연결할 수 있습니다.</EmptyLine>
          ) : (
            <List as="fieldset">
              {investments.map((inv) => (
                <ListCheckItem
                  key={inv.id}
                  title={inv.accountName || "이름 없는 계좌"}
                  detail={linkedElsewhereDetail(portfolioByAccount.get(inv.id), portfolio.id)}
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
        </ChipTabsContent>

        <ChipTabsContent value="memo">
          <div className="px-x4 pt-x3">
            <TextField
              aria-label="메모"
              value={portfolio.note}
              onValueChange={({ value }) => updatePortfolio(portfolio.id, "note", value)}
              readOnly={readOnly}
            >
              <TextFieldTextarea placeholder="리밸런싱 기준, 매매 규칙 등을 기록" />
            </TextField>
          </div>
        </ChipTabsContent>
      </ChipTabsRoot>

      {!readOnly && (
        <>
          <HeaderAction>
            <ActionButton
              variant="ghost"
              size="small"
              aria-label="포트폴리오 수정"
              onClick={() => setEditing({ kind: "settings" })}
            >
              수정
            </ActionButton>
          </HeaderAction>

          <PortfolioSettingsSheet
            key={`settings-${editing?.kind === "settings"}`}
            {...sheetProps(editing?.kind === "settings")}
            portfolio={portfolio}
            onRename={(name) => updatePortfolio(portfolio.id, "name", name)}
            onColorChange={(color) => updatePortfolio(portfolio.id, "color", color)}
            onDelete={deletePortfolio}
          />
          <EditDriftThresholdSheet
            key={`drift-${editing?.kind === "drift"}`}
            {...sheetProps(editing?.kind === "drift")}
            value={portfolio.driftThresholdPercent}
            onSave={(value) => setDriftThreshold(portfolio.id, value)}
          />
          <ImportAllocationsSheet
            key={`import-${editing?.kind === "import-allocations"}`}
            {...sheetProps(editing?.kind === "import-allocations")}
            targetPortfolioId={portfolio.id}
            existingKeys={usedKeys}
            onImport={(items) =>
              items.forEach(({ stock, targetPercent }) =>
                addAllocation(portfolio.id, {
                  market: stock.market,
                  ticker: stock.ticker,
                  name: stock.name,
                  currency: stock.currency,
                  targetPercent,
                })
              )
            }
          />
          <AddAllocationFlow
            {...sheetProps(editing?.kind === "add-allocation")}
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
          {editingAllocation && (
            <EditAllocationSheet
              key={editingAllocation.id}
              {...sheetProps(true)}
              allocation={editingAllocation}
              remainingPercent={100 - totalPct}
              onSave={(percent) =>
                updateAllocation(portfolio.id, editingAllocation.id, "targetPercent", percent)
              }
              onDelete={() => removeAllocation(portfolio.id, editingAllocation.id)}
            />
          )}
        </>
      )}
    </div>
  );
}

/** 다른 포트폴리오에 연결된 계좌라면 그 사실과 체크 시 동작을 알려준다. */
function linkedElsewhereDetail(
  linked: PortfolioItem | undefined,
  currentPortfolioId: string
): string | undefined {
  if (!linked || linked.id === currentPortfolioId) return undefined;
  return `${linked.name || "다른 포트폴리오"}에 연결됨 · 체크하면 이 포트폴리오로 옮겨요`;
}
