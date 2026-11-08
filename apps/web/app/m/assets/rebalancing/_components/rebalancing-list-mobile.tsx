"use client";

import { useMemo } from "react";
import { IconChevronRightLine } from "@karrotmarket/react-monochrome-icon";
import { Divider, Icon } from "@seed-design/react";
import { useFlow } from "@stackflow/react";
import { useSwitchTab } from "@web/app/m/_stack/use-switch-tab";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import {
  groupAccountsByRebalancingState,
  type AccountRebalancingState,
} from "@web/features/portfolio/utils/group-accounts-by-rebalancing-state";
import type { LinkedPortfolioStatus } from "@web/features/portfolio/utils/linked-portfolio-status";
import { useLinkedPortfolioStatus } from "@web/features/portfolio/utils/use-linked-portfolio-status";
import { Badge } from "@web/seed-design/ui/badge";
import { ResultSection } from "@web/seed-design/ui/result-section";
import { numberToKorean } from "@web/utils/number-format";

const GROUP_TITLE: Record<AccountRebalancingState, string> = {
  "needs-rebalancing": "이격 초과",
  ok: "정상",
  unknown: "판단 불가",
  unlinked: "연결된 포트폴리오 없음",
};

/**
 * 하단 탭 "리밸런싱": 리밸런싱 대상은 계좌다. 계좌를 상태별(이격 초과 → 정상 →
 * 판단 불가 → 연결 없음)로 묶어 보여주고, 탭하면 계좌 리밸런싱 상세로 들어간다.
 */
export function RebalancingListMobile() {
  const investments = useInvestmentStore((s) => s.investments);
  const statusFor = useLinkedPortfolioStatus();
  const { push } = useFlow();
  const switchTab = useSwitchTab();

  const groups = useMemo(
    () =>
      groupAccountsByRebalancingState(
        investments.map((account) => ({ account, status: statusFor(account.id) }))
      ),
    [investments, statusFor]
  );

  if (investments.length === 0) {
    return (
      <div className="flex min-h-[60dvh] flex-col">
        <ResultSection
          title="투자 계좌가 없어요"
          description="투자 계좌를 추가하고 포트폴리오에 연결하면 계좌별로 리밸런싱할 수 있어요."
          primaryActionProps={{
            children: "계좌 탭으로 이동",
            onClick: () => switchTab("AccountsTab"),
          }}
        />
      </div>
    );
  }

  return (
    <div className="pb-x4">
      {groups.map((group, groupIndex) => (
        <section key={group.state}>
          {groupIndex > 0 && <Divider />}
          <div className="flex items-baseline gap-x2 px-x4 pt-x5 pb-x2">
            <h2
              className={
                group.state === "needs-rebalancing" ? "t5-bold text-fg-critical" : "t5-bold"
              }
            >
              {GROUP_TITLE[group.state]}
            </h2>
            <span className="t3-regular text-fg-neutral-subtle tabular-nums">
              {group.rows.length}
            </span>
          </div>
          {group.rows.map(({ account, status }, rowIndex) => {
            const needsRebalancing = status?.state === "needs-rebalancing";
            return (
              <div key={account.id}>
                {rowIndex > 0 && <Divider inset />}
                <button
                  type="button"
                  onClick={() => push("RebalancingDetail", { id: account.id })}
                  className="relative active:bg-bg-layer-default-pressed flex w-full items-center gap-x3 px-x4 py-x4 text-left"
                >
                  {needsRebalancing && (
                    <span
                      className="bg-bg-critical-solid absolute inset-y-x3 left-0 w-x1 rounded-r-full"
                      aria-hidden
                    />
                  )}
                  <span
                    className="size-x3 shrink-0 rounded-full"
                    style={{ backgroundColor: account.color }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="t5-bold truncate">{account.accountName || "이름 없는 계좌"}</p>
                    <p className="t3-regular text-fg-neutral-subtle mt-[2px] tabular-nums">
                      {account.accountType} · {numberToKorean(account.currentValue) || "0원"}
                    </p>
                    <div className="mt-x2 flex flex-wrap gap-x1">
                      {status ? (
                        <PortfolioStatusBadge status={status} />
                      ) : (
                        <Badge tone="neutral" variant="weak">
                          연결된 포트폴리오 없음
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Icon svg={<IconChevronRightLine />} size="x5" color="fg.neutralSubtle" />
                </button>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function PortfolioStatusBadge({ status }: { status: LinkedPortfolioStatus }) {
  if (status.state === "needs-rebalancing") {
    return (
      <Badge tone="critical" variant="weak">
        {status.name} · 이격 초과 {status.breachedCount}건
      </Badge>
    );
  }
  if (status.state === "ok") {
    return (
      <Badge tone="positive" variant="weak">
        {status.name} · 정상
      </Badge>
    );
  }
  return (
    <Badge tone="neutral" variant="weak">
      {status.name} · 판단 불가
    </Badge>
  );
}
