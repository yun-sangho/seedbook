"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconPlusCircleLine } from "@karrotmarket/react-monochrome-icon";
import { Icon } from "@seed-design/react";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { ACCOUNT_TYPES } from "@web/features/investments/types/constants";
import { toHoldingSeeds, type HoldingSeed } from "@web/features/investments/utils/holding-seeds";
import { usePortfolioStore } from "@web/features/portfolio/stores/portfolio-store";
import {
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetRoot,
} from "@web/seed-design/ui/bottom-sheet";
import { List, ListButtonItem } from "@web/seed-design/ui/list";

interface AddAccountSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function SourceHeader({ children }: { children: string }) {
  return <p className="t3-bold text-fg-neutral-subtle px-x4 pt-x4 pb-x1">{children}</p>;
}

/**
 * 계좌 추가: 유형 선택 → 시작 종목 선택 (빈 계좌 / 기존 계좌 종목 복사 / 포트폴리오 종목).
 * 종목은 수량 0 으로 들어가고, 생성 뒤 계좌 상세로 이동해 수량을 입력한다.
 * 포트폴리오에서 시작하면 새 계좌를 그 포트폴리오에 자동 연결한다.
 */
export function AddAccountSheet({ open, onOpenChange }: AddAccountSheetProps) {
  const router = useRouter();
  const investments = useInvestmentStore((s) => s.investments);
  const addInvestmentWithType = useInvestmentStore((s) => s.addInvestmentWithType);
  const portfolios = usePortfolioStore((s) => s.portfolios);
  const toggleAccountLink = usePortfolioStore((s) => s.toggleAccountLink);

  const [accountType, setAccountType] = useState<string | null>(null);

  const accountSources = investments
    .map((inv) => ({ inv, seeds: toHoldingSeeds(inv.holdings ?? []) }))
    .filter((s) => s.seeds.length > 0);
  const portfolioSources = portfolios
    .map((p) => ({ portfolio: p, seeds: toHoldingSeeds(p.allocations) }))
    .filter((s) => s.seeds.length > 0);
  const hasSources = accountSources.length > 0 || portfolioSources.length > 0;

  const handleOpenChange = (next: boolean) => {
    if (!next) setAccountType(null);
    onOpenChange(next);
  };

  const create = (type: string, holdings: HoldingSeed[] = [], linkPortfolioId?: string) => {
    const id = addInvestmentWithType(type, { holdings });
    if (linkPortfolioId) toggleAccountLink(linkPortfolioId, id);
    handleOpenChange(false);
    router.push(`/assets/investments/${id}`);
  };

  return (
    <BottomSheetRoot open={open} onOpenChange={handleOpenChange}>
      {accountType === null ? (
        <BottomSheetContent title="투자 계좌 추가" description="계좌 유형을 선택하세요" showHandle>
          <BottomSheetBody>
            <List>
              {ACCOUNT_TYPES.map((type) => (
                <ListButtonItem
                  key={type}
                  title={type}
                  onClick={() => (hasSources ? setAccountType(type) : create(type))}
                />
              ))}
            </List>
          </BottomSheetBody>
        </BottomSheetContent>
      ) : (
        <BottomSheetContent
          title="어떤 종목으로 시작할까요?"
          description={`${accountType} · 수량은 추가 후 입력합니다`}
          showHandle
          className="!max-h-[85dvh]"
        >
          <BottomSheetBody>
            <List>
              <ListButtonItem
                prefix={<Icon svg={<IconPlusCircleLine />} />}
                title="빈 계좌로 시작"
                detail="예수금만 있는 계좌"
                onClick={() => create(accountType)}
              />
            </List>

            {portfolioSources.length > 0 && (
              <>
                <SourceHeader>포트폴리오 종목으로 시작</SourceHeader>
                <List>
                  {portfolioSources.map(({ portfolio, seeds }) => (
                    <ListButtonItem
                      key={portfolio.id}
                      prefix={
                        <span
                          className="size-x3 block rounded-full"
                          style={{ backgroundColor: portfolio.color }}
                          aria-hidden
                        />
                      }
                      title={portfolio.name}
                      detail={`${seeds.length}종목 · 이 포트폴리오에 자동 연결`}
                      onClick={() => create(accountType, seeds, portfolio.id)}
                    />
                  ))}
                </List>
              </>
            )}

            {accountSources.length > 0 && (
              <>
                <SourceHeader>기존 계좌 종목 복사</SourceHeader>
                <List>
                  {accountSources.map(({ inv, seeds }) => (
                    <ListButtonItem
                      key={inv.id}
                      prefix={
                        <span
                          className="size-x3 block rounded-full"
                          style={{ backgroundColor: inv.color }}
                          aria-hidden
                        />
                      }
                      title={inv.accountName}
                      detail={`${seeds.length}종목 · ${inv.accountType}`}
                      onClick={() => create(accountType, seeds)}
                    />
                  ))}
                </List>
              </>
            )}
          </BottomSheetBody>
        </BottomSheetContent>
      )}
    </BottomSheetRoot>
  );
}
