import type { PortfolioItem } from "../types/types";

/**
 * 계좌 ↔ 포트폴리오 연결 규칙: **한 계좌는 최대 하나의 포트폴리오에만 연결된다.**
 *
 * 데이터 모양은 아직 `PortfolioItem.accountIds[]` 이므로 이 불변식은 store 액션과
 * persist migrate 에서 지킨다. (서버 스키마를 `investment_account.portfolioId` 로
 * 옮기면 DB 가 직접 보장하게 된다.)
 */

/** dedupe 에 필요한 최소 모양 — store 의 `PortfolioItem` 과 서버 translator payload 가 공유. */
type LinkedPortfolio = Pick<PortfolioItem, "accountIds"> & { updatedAt?: string };

/**
 * 같은 계좌가 여러 포트폴리오에 연결돼 있으면 `updatedAt` 이 가장 최근인 포트폴리오에만
 * 남기고 나머지에서 뺀다. 동률이면 목록에서 앞선 포트폴리오가 이긴다. 비어 있는 `updatedAt`
 * 은 가장 오래된 것으로 본다.
 *
 * 순수 함수 — 포트폴리오 순서와 `updatedAt` 은 그대로 두고 (마이그레이션이 "수정" 으로
 * 보이지 않게), 바뀐 포트폴리오만 새 객체로 돌려준다.
 */
export function dedupePortfolioLinks<T extends LinkedPortfolio>(portfolios: T[]): T[] {
  const owner = new Map<string, number>();
  portfolios.forEach((p, index) => {
    for (const accountId of p.accountIds) {
      const current = owner.get(accountId);
      if (current === undefined || isNewer(p, portfolios[current]!)) {
        owner.set(accountId, index);
      }
    }
  });

  return portfolios.map((p, index) => {
    const kept = Array.from(new Set(p.accountIds.filter((id) => owner.get(id) === index)));
    return sameIds(kept, p.accountIds) ? p : { ...p, accountIds: kept };
  });
}

/** 계좌 id → 연결된 포트폴리오. 연결되지 않은 계좌는 키가 없다. */
export function accountPortfolioMap(portfolios: PortfolioItem[]): Map<string, PortfolioItem> {
  const map = new Map<string, PortfolioItem>();
  for (const p of portfolios) {
    for (const accountId of p.accountIds) {
      if (!map.has(accountId)) map.set(accountId, p);
    }
  }
  return map;
}

// ISO 8601 (UTC, 같은 자릿수) 문자열은 사전순 비교가 시간순 비교와 같다.
function isNewer(candidate: LinkedPortfolio, incumbent: LinkedPortfolio): boolean {
  return (candidate.updatedAt ?? "") > (incumbent.updatedAt ?? "");
}

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}
