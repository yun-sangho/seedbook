import {
  DEFAULT_HOLDINGS_SORT_OPTION,
  HOLDINGS_SORT_OPTION_VALUES,
  type HoldingsSortOption,
} from "@web/features/investments/types/holdings-sort";
import {
  ACCOUNT_SORT_OPTION_VALUES,
  type AccountSortOption,
  DEFAULT_ACCOUNT_SORT_OPTION,
} from "@web/features/investments/utils/sort-accounts";
import {
  DEFAULT_PORTFOLIO_STOCK_SORT_OPTION,
  PORTFOLIO_STOCK_SORT_OPTION_VALUES,
  type PortfolioStockSortOption,
} from "@web/features/portfolio/utils/sort-portfolio-stock-rows";
import {
  parseCollapsedSections,
  type RebalancingTaskSection,
} from "@web/features/rebalancing/utils/collapsed-sections";
import {
  DEFAULT_REBALANCING_TASK_SORT,
  isRebalancingTaskSort,
  type RebalancingTaskSort,
} from "@web/features/rebalancing/utils/sort-rebalancing-tasks";
import { TimeRange } from "@web/types/time.consts";

/**
 * 계정에 저장하는 화면 설정 (`user_preference`, `/api/me/preferences`). 저장소 모드(local/cloud)와
 * 상관없이 항상 서버에 저장해 어느 기기에서 로그인해도 같은 값을 쓴다 — 저장소 모드·엔티티 동기화는
 * 자산 데이터(계좌·포트폴리오·리밸런싱)만 다룬다. 의존성이 없어 서버에서도 쓴다.
 */
export interface AccountPreferences {
  /** 진행 중 리밸런싱의 매매 정렬. */
  rebalancingTaskSort?: RebalancingTaskSort;
  /** 진행 중 리밸런싱에서 접어 둔 매매 섹션. 비어 있으면 모두 펼침. */
  rebalancingCollapsedSections?: RebalancingTaskSection[];
  /** 계좌 목록 정렬. */
  accountSortOption?: AccountSortOption;
  /** 포트폴리오 현황 "종목별" 정렬. */
  portfolioStockSortOption?: PortfolioStockSortOption;
  /**
   * 투자 추이 차트 기간. 차트를 지워 화면에서는 쓰지 않는다 — 계정 설정 정의(`settings`)와
   * 맞추려 남긴다 (동기화 v2-5 에서 제거).
   */
  investmentTrendRange?: TimeRange;
  /** 보유 종목 정렬 — 계좌 상세의 보유 종목과 "종목" 탭이 같이 쓴다. */
  holdingsSortOption?: HoldingsSortOption;
}

export type AccountPreferenceKey = keyof AccountPreferences;

export const DEFAULT_ACCOUNT_PREFERENCES: Required<AccountPreferences> = {
  rebalancingTaskSort: DEFAULT_REBALANCING_TASK_SORT,
  rebalancingCollapsedSections: [],
  accountSortOption: DEFAULT_ACCOUNT_SORT_OPTION,
  portfolioStockSortOption: DEFAULT_PORTFOLIO_STOCK_SORT_OPTION,
  investmentTrendRange: TimeRange.THREE_MONTHS,
  holdingsSortOption: DEFAULT_HOLDINGS_SORT_OPTION,
};

const oneOf =
  <T extends string>(values: readonly T[]) =>
  (value: unknown): T | null =>
    values.find((option) => option === value) ?? null;

/** 항목마다 저장된 값을 읽는다. 알아볼 수 없으면 null. */
const PARSERS: { [K in AccountPreferenceKey]-?: (value: unknown) => AccountPreferences[K] | null } =
  {
    rebalancingTaskSort: (value) => (isRebalancingTaskSort(value) ? value : null),
    rebalancingCollapsedSections: parseCollapsedSections,
    accountSortOption: oneOf(ACCOUNT_SORT_OPTION_VALUES),
    portfolioStockSortOption: oneOf(PORTFOLIO_STOCK_SORT_OPTION_VALUES),
    investmentTrendRange: oneOf(Object.values(TimeRange)),
    holdingsSortOption: oneOf(HOLDINGS_SORT_OPTION_VALUES),
  };

const KEYS = Object.keys(PARSERS) as AccountPreferenceKey[];

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

/**
 * 알아볼 수 있는 설정만 남긴다. 없어진 옵션(예전 캐시·서버 값), 다른 타입, 모르는 키는 뺀다.
 * 접어 둔 섹션은 모르는 섹션 이름만 버리고 목록은 남긴다.
 */
export function parseAccountPreferences(value: unknown): AccountPreferences {
  const record = asRecord(value);
  const prefs: Record<string, unknown> = {};
  for (const key of KEYS) {
    const parsed = PARSERS[key](record[key]);
    if (parsed !== null) prefs[key] = parsed;
  }
  return prefs as AccountPreferences;
}

/** 보낸 값이 있지만 알아볼 수 없는 설정 이름 (저장 요청을 거절할 때). */
export function invalidPreferenceKeys(value: unknown): AccountPreferenceKey[] {
  const record = asRecord(value);
  return KEYS.filter((key) => record[key] !== undefined && PARSERS[key](record[key]) === null);
}
