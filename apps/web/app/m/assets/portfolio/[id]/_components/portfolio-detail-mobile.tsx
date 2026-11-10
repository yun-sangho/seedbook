"use client";

import { Fragment, useMemo, useState, type CSSProperties } from "react";
import { IconArrowDownHorizlineLine, IconPlusLine } from "@karrotmarket/react-monochrome-icon";
import { Icon } from "@seed-design/react";
import { useFlow } from "@stackflow/react";
import { usePopThenRemove } from "@web/app/m/_stack/use-pop-then-remove";
import { EditHint, EmptyLine, TabToolbar } from "@web/components/mobile/detail-layout";
import { HeaderAction } from "@web/components/mobile/header-action";
import { HoldingsPriceAsOfBanner } from "@web/components/mobile/price-as-of-banner";
import { profitToneClass } from "@web/components/mobile/profit-tone";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { summarizeAccounts } from "@web/features/investments/utils/summarize-accounts";
import { useLiveAccounts } from "@web/features/investments/utils/use-live-accounts";
import { useStockPrices } from "@web/features/investments/utils/use-stock-prices";
import { usePortfolioStore } from "@web/features/portfolio/stores/portfolio-store";
import type { PortfolioItem } from "@web/features/portfolio/types/types";
import { exampleTargetPercent } from "@web/features/portfolio/utils/drift-percent";
import { linkedPortfolioStatus } from "@web/features/portfolio/utils/linked-portfolio-status";
import {
  accountPortfolioMap,
  otherLinkedPortfolio,
  sortLinkedElsewhereLast,
} from "@web/features/portfolio/utils/portfolio-links";
import { resolvePortfolioAccounts } from "@web/features/portfolio/utils/resolve-portfolio-accounts";
import { summarizePortfolioDrift } from "@web/features/portfolio/utils/summarize-portfolio-drift";
import { validateAllocations } from "@web/features/portfolio/utils/validate-allocations";
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
import { formatReturnRate, formatWithCommas, numberToKorean } from "@web/utils/number-format";
import { formatProfitWon } from "@web/utils/profit-color";
import { AddAllocationFlow, EditAllocationSheet } from "./allocation-sheets";
import { ImportAllocationsSheet } from "./import-allocations-sheet";
import { MoveAccountSheet, type AccountMove } from "./move-account-sheet";
import { PortfolioDriftCard } from "./portfolio-drift-card";
import { EditDriftThresholdSheet, PortfolioSettingsSheet } from "./portfolio-edit-sheets";
import { PortfolioOverviewTab } from "./portfolio-overview-tab";

type Tab = "overview" | "allocations" | "accounts" | "memo";

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

/** 합계 상태별 글자 색 (초과 critical / 미달 warning / 100% positive). */
function totalToneClass(totalPct: number, hasAllocations: boolean): string {
  if (totalPct > 100) return "text-fg-critical";
  if (totalPct < 100 && hasAllocations) return "text-fg-warning";
  return "text-fg-positive";
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
  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState<Editing | null>(null);

  const updatePortfolio = usePortfolioStore((s) => s.updatePortfolio);
  const removePortfolio = usePortfolioStore((s) => s.removePortfolio);
  const deletePortfolio = usePopThenRemove(() => removePortfolio(portfolio.id));
  const addAllocation = usePortfolioStore((s) => s.addAllocation);
  const updateAllocation = usePortfolioStore((s) => s.updateAllocation);
  const removeAllocation = usePortfolioStore((s) => s.removeAllocation);
  const toggleAccountLink = usePortfolioStore((s) => s.toggleAccountLink);
  const setDriftThreshold = usePortfolioStore((s) => s.setDriftThreshold);
  const setDriftMode = usePortfolioStore((s) => s.setDriftMode);
  const investments = useInvestmentStore((s) => s.investments);
  const portfolios = usePortfolioStore((s) => s.portfolios);
  // 한 계좌는 하나의 포트폴리오에만 연결된다 — 다른 포트폴리오에 연결된 계좌는 확인 후 옮겨온다.
  const portfolioByAccount = useMemo(() => accountPortfolioMap(portfolios), [portfolios]);
  const [pendingMove, setPendingMove] = useState<AccountMove | null>(null);
  // 다른 포트폴리오에 연결된 계좌는 목록 끝에.
  const accountsForLinking = useMemo(
    () => sortLinkedElsewhereLast(investments, portfolioByAccount, portfolio.id),
    [investments, portfolioByAccount, portfolio.id]
  );

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
  // 삭제된 계좌는 연결 목록에 남아 있어도 빠진다.
  const storedLinkedAccounts = useMemo(
    () => resolvePortfolioAccounts(portfolio, investments),
    [portfolio, investments]
  );
  // 저장된 평가금액이 아니라 지금 시세로 다시 계산한 금액을 보여준다 (계좌 상세와 같은 값).
  const linkedAccounts = useLiveAccounts(storedLinkedAccounts);
  const linkedCount = linkedAccounts.length;
  const linkedTotals = useMemo(() => summarizeAccounts(linkedAccounts), [linkedAccounts]);
  // 계좌별 리밸런싱 필요 여부 — 상단 이격 카드와 현황 탭의 계좌 목록이 같은 판정을 쓴다.
  const linkedHoldings = useMemo(
    () => linkedAccounts.flatMap((inv) => inv.holdings ?? []),
    [linkedAccounts]
  );
  const { prices } = useStockPrices(linkedHoldings);
  const accountStatuses = useMemo(
    () =>
      new Map(
        linkedAccounts.map((inv) => [
          inv.id,
          linkedPortfolioStatus(inv.id, [portfolio], linkedAccounts, prices),
        ])
      ),
    [portfolio, linkedAccounts, prices]
  );
  const driftSummary = useMemo(
    () => summarizePortfolioDrift(linkedAccounts.map((inv) => accountStatuses.get(inv.id) ?? null)),
    [linkedAccounts, accountStatuses]
  );

  const totalPct = validation.totalPercent;
  const totalClass = totalToneClass(totalPct, portfolio.allocations.length > 0);
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
      {/* 평가금액은 연결 계좌 보유 종목의 시세 기준 — 그 기준 시각을 알린다. */}
      <HoldingsPriceAsOfBanner investments={linkedAccounts} />
      <section className="px-x4 pt-x4 pb-x3">
        {/* 계좌 상세와 같은 모양 (1원 단위 + 만원 단위 보조) — 이 포트폴리오에 연결된 계좌만 합친다. */}
        <p className="flex flex-wrap items-baseline gap-x-x2">
          <span className="t9-bold tabular-nums">
            {formatWithCommas(Math.round(linkedTotals.current))}원
          </span>
          <span className="t4-regular text-fg-neutral-subtle tabular-nums">
            {numberToKorean(linkedTotals.current) || "0원"}
          </span>
        </p>
        {linkedCount > 0 ? (
          <>
            <p className={`t4-medium mt-x1 tabular-nums ${profitToneClass(linkedTotals.profit)}`}>
              {formatProfitWon(linkedTotals.profit)} ({formatReturnRate(linkedTotals.returnRate)})
            </p>
            <p className="t3-regular text-fg-neutral-subtle mt-x2">
              투자원금 {formatWithCommas(linkedTotals.initial)}원 · 계좌 {linkedCount}개
            </p>
          </>
        ) : (
          <p className="t3-regular text-fg-neutral-subtle mt-x2">
            연결된 계좌가 없어요. 적용 계좌 탭에서 연결하세요.
          </p>
        )}
        <PortfolioDriftCard
          portfolio={portfolio}
          summary={driftSummary}
          linkedCount={linkedCount}
          onEdit={() => setEditing({ kind: "drift" })}
        />
      </section>

      <ChipTabsRoot
        value={tab}
        onValueChange={(value) => setTab(value as Tab)}
        variant="neutralSolid"
        size="medium"
      >
        <div className="pt-x3">
          <ChipTabsList>
            <ChipTabsTrigger value="overview">현황</ChipTabsTrigger>
            <ChipTabsTrigger value="allocations">
              종목 비중 {portfolio.allocations.length}
            </ChipTabsTrigger>
            <ChipTabsTrigger value="accounts">적용 계좌 {linkedCount}</ChipTabsTrigger>
            <ChipTabsTrigger value="memo">메모</ChipTabsTrigger>
          </ChipTabsList>
        </div>

        <ChipTabsContent value="overview">
          <PortfolioOverviewTab
            portfolio={portfolio}
            linkedAccounts={linkedAccounts}
            prices={prices}
            accountStatuses={accountStatuses}
          />
        </ChipTabsContent>

        <ChipTabsContent value="allocations">
          <TabToolbar
            meta={
              portfolio.allocations.length > 0 ? (
                <>
                  {portfolio.allocations.length}종목 · 남은 비중{" "}
                  {Math.max(0, 100 - totalPct).toFixed(1)}% ·{" "}
                  <span className={cn("tabular-nums", totalClass)}>
                    합계 {totalPct.toFixed(1)}%
                  </span>
                </>
              ) : undefined
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
                        <EditHint />
                      </span>
                    }
                    suffix={
                      <span className="t5-bold text-fg-neutral tabular-nums">
                        {a.targetPercent}%
                      </span>
                    }
                    alignItems="center"
                    rootProps={{ style: ROW_STYLE }}
                    aria-label={`${a.name || "종목"} 비중 수정`}
                    onClick={() => setEditing({ kind: "allocation", id: a.id })}
                  />
                </Fragment>
              ))}
            </List>
          )}
          {/* 종목 추가는 목록 맨 아래에 둔다 (계좌 상세와 같은 흐름). 검색 또는 계좌·포트폴리오에서 가져오기. */}
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
              {accountsForLinking.map((inv) => {
                const other = otherLinkedPortfolio(portfolioByAccount, inv.id, portfolio.id);
                return (
                  <ListCheckItem
                    key={inv.id}
                    title={inv.accountName || "이름 없는 계좌"}
                    detail={linkedElsewhereDetail(other)}
                    // 다른 포트폴리오에 연결된 계좌는 흐리게 — 체크하면 이동 확인 시트가 뜬다.
                    className={cn(other && "opacity-50")}
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
                    onCheckedChange={() => {
                      if (other) {
                        setPendingMove({
                          accountId: inv.id,
                          accountName: inv.accountName || "이름 없는 계좌",
                          fromPortfolioName: other.name || "다른 포트폴리오",
                        });
                        return;
                      }
                      toggleAccountLink(portfolio.id, inv.id);
                    }}
                  />
                );
              })}
            </List>
          )}
          <MoveAccountSheet
            move={pendingMove}
            toPortfolioName={portfolio.name}
            onConfirm={(accountId) => toggleAccountLink(portfolio.id, accountId)}
            onClose={() => setPendingMove(null)}
          />
        </ChipTabsContent>

        <ChipTabsContent value="memo">
          <div className="px-x4 pt-x3">
            <TextField
              value={portfolio.note}
              onValueChange={({ value }) => updatePortfolio(portfolio.id, "note", value)}
            >
              <TextFieldTextarea
                aria-label="메모"
                placeholder="리밸런싱 기준, 매매 규칙 등을 기록"
              />
            </TextField>
          </div>
        </ChipTabsContent>
      </ChipTabsRoot>

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
          mode={portfolio.driftMode}
          value={portfolio.driftThresholdPercent}
          exampleTarget={exampleTargetPercent(portfolio.allocations)}
          onSave={(mode, value) => {
            setDriftMode(portfolio.id, mode);
            setDriftThreshold(portfolio.id, value);
          }}
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
    </div>
  );
}

/** 다른 포트폴리오에 연결된 계좌라면 그 사실을 알려준다 (체크하면 이동 확인 시트가 뜬다). */
function linkedElsewhereDetail(linked: PortfolioItem | undefined): string | undefined {
  if (!linked) return undefined;
  return `${linked.name || "다른 포트폴리오"}에 연결됨`;
}
