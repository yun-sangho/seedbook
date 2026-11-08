import { seedPlugin, type SeedPluginOptions } from "@seed-design/stackflow";
import { defineConfig } from "@stackflow/config";
import { historySyncPlugin } from "@stackflow/plugin-history-sync";
import { basicRendererPlugin } from "@stackflow/plugin-renderer-basic";
import { stackflow } from "@stackflow/react";
import {
  AccountDetailActivity,
  AccountsTabActivity,
  HomeTabActivity,
  PortfolioDetailActivity,
  PortfolioTabActivity,
  RebalancingDetailActivity,
  RebalancingTabActivity,
} from "./activities";
import { createNextAwareHistory } from "./next-aware-history";

/**
 * 모바일 (`/m` 트리) 화면 스택. 하단 탭 4개는 루트 activity 로 두고 탭 전환은
 * `replace` (애니메이션 없음), 상세 화면은 `push` 로 쌓는다.
 *
 * URL 은 데스크탑과 같은 `/assets/...` 를 그대로 쓴다 (middleware 가 `/m` 으로 rewrite).
 * history sync 의 pushState 는 Next App Router 가 패치해 자신의 history state(`__NA`) 를
 * 복사해 주므로, 뒤로가기(popstate) 시 Next 가 페이지를 새로고침하지 않는다.
 * 이 모듈은 `window` 를 쓰므로 클라이언트 전용으로만 불러온다 (`mobile-stack.tsx`).
 */
declare module "@stackflow/config" {
  interface Register {
    HomeTab: Record<string, never>;
    AccountsTab: Record<string, never>;
    RebalancingTab: Record<string, never>;
    PortfolioTab: Record<string, never>;
    AccountDetail: { id: string };
    RebalancingDetail: { id: string };
    PortfolioDetail: { id: string };
  }
}

export type TabActivityName = "HomeTab" | "AccountsTab" | "RebalancingTab" | "PortfolioTab";

/** 상세 URL 로 바로 들어와도 뒤로가기가 해당 탭 목록으로 가도록 아래에 깔 화면. */
function underTab(activityName: TabActivityName) {
  return () => [{ activityName, activityParams: {} }];
}

const config = defineConfig({
  activities: [
    { name: "HomeTab", route: "/assets" },
    { name: "AccountsTab", route: "/assets/investments" },
    { name: "RebalancingTab", route: "/assets/rebalancing" },
    { name: "PortfolioTab", route: "/assets/portfolio" },
    {
      name: "AccountDetail",
      route: { path: "/assets/investments/:id", defaultHistory: underTab("AccountsTab") },
    },
    {
      name: "RebalancingDetail",
      route: { path: "/assets/rebalancing/:id", defaultHistory: underTab("RebalancingTab") },
    },
    {
      name: "PortfolioDetail",
      route: { path: "/assets/portfolio/:id", defaultHistory: underTab("PortfolioTab") },
    },
  ],
  transitionDuration: 350,
});

export const { Stack } = stackflow({
  config,
  components: {
    HomeTab: HomeTabActivity,
    AccountsTab: AccountsTabActivity,
    RebalancingTab: RebalancingTabActivity,
    PortfolioTab: PortfolioTabActivity,
    AccountDetail: AccountDetailActivity,
    RebalancingDetail: RebalancingDetailActivity,
    PortfolioDetail: PortfolioDetailActivity,
  },
  plugins: [
    basicRendererPlugin(),
    // 테마는 기기에 맞춘다 (`<Stack initialContext={{ theme }} />`).
    seedPlugin(({ initialContext }) => ({
      theme: (initialContext as Partial<SeedPluginOptions> | undefined)?.theme ?? "cupertino",
    })),
    historySyncPlugin({
      config,
      fallbackActivity: () => "HomeTab",
      // 첫 렌더 중 history 기록이 Next 라우터를 setState 하지 않도록 (next-aware-history.ts).
      history: createNextAwareHistory(),
    }),
  ],
});
