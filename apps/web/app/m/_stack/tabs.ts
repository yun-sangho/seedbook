/** 하단 탭. `home` 은 `/assets`, 나머지는 `/assets/<탭>` 이다. */
export const TAB_KEYS = ["home", "investments", "rebalancing", "portfolio"] as const;
export type TabKey = (typeof TAB_KEYS)[number];

/** `Tabs` 화면의 params. 홈은 `tab` 이 없다 (URL 이 `/assets`). */
export interface TabsParams {
  tab?: string;
}

export function tabParams(tab: TabKey): { tab?: string } {
  return tab === "home" ? {} : { tab };
}

/** 모르는 주소(`/assets/foo`)는 홈으로 본다. */
export function tabOf({ tab }: TabsParams): TabKey {
  return TAB_KEYS.find((key) => key === tab) ?? "home";
}
