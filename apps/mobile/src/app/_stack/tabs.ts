/** 하단 탭. 주소는 `/<탭>` 이다 (`/home`·`/accounts`·`/rebalancing`·`/portfolios`). */
export const TAB_KEYS = ["home", "accounts", "rebalancing", "portfolios"] as const;
export type TabKey = (typeof TAB_KEYS)[number];

/** `Tabs` 화면의 params. 홈은 `tab` 이 없다 (주소는 `/home`, `tabPath`). */
export interface TabsParams {
  tab?: string;
}

export function tabParams(tab: TabKey): { tab?: string } {
  return tab === "home" ? {} : { tab };
}

/** 모르는 주소(`/foo`)는 홈으로 본다. */
export function tabOf({ tab }: TabsParams): TabKey {
  return TAB_KEYS.find((key) => key === tab) ?? "home";
}

/** 주소에 적을 params — 홈도 `/home` 으로 적는다 (웹에서는 `/` 가 소개 페이지다). */
export function tabPath(params: TabsParams): { tab: TabKey } {
  return { tab: tabOf(params) };
}
