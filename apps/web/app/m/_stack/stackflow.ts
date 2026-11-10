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
  RebalancingNewActivity,
  RebalancingSessionActivity,
  RebalancingTabActivity,
  RebalancingTradeActivity,
} from "./activities";
import { createNextAwareHistory } from "./next-aware-history";

/**
 * 모바일 (`/m` 트리) 화면 스택. 하단 탭 4개는 루트 activity 로 두고 탭 전환은
 * `replace` (애니메이션 없음), 상세 화면은 `push` 로 쌓는다.
 *
 * URL 은 데스크탑과 같은 `/assets/...` 를 그대로 쓴다 (middleware 가 `/m` 으로 rewrite).
 * 스택은 브라우저 history 를 쌓지 않는 단일 페이지로 동작하고, 뒤로가기는 앱바 뒤로 버튼과
 * SEED 스와이프만 쓴다 (next-aware-history.ts).
 * 이 모듈은 `window` 를 쓰므로 클라이언트 전용으로만 불러온다 (`mobile-stack.tsx`).
 */
declare module "@stackflow/config" {
  interface Register {
    HomeTab: Record<string, never>;
    AccountsTab: Record<string, never>;
    RebalancingTab: Record<string, never>;
    PortfolioTab: Record<string, never>;
    AccountDetail: { id: string };
    RebalancingNew: Record<string, never>;
    RebalancingDetail: { id: string };
    RebalancingSession: { id: string };
    RebalancingTrade: { id: string; taskId: string };
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
      name: "RebalancingNew",
      route: { path: "/assets/rebalancing/new", defaultHistory: underTab("RebalancingTab") },
    },
    {
      // 계좌 리밸런싱 계산. 정적 경로(`new`)가 `:id` 보다 먼저 매칭된다 (history-sync 정렬).
      name: "RebalancingDetail",
      route: { path: "/assets/rebalancing/:id", defaultHistory: underTab("RebalancingTab") },
    },
    {
      name: "RebalancingSession",
      route: {
        path: "/assets/rebalancing/sessions/:id",
        defaultHistory: underTab("RebalancingTab"),
      },
    },
    {
      // 매매 하나의 체결 수량·가격 입력. 바로 들어와도 뒤로가기가 그 리밸런싱으로 간다.
      name: "RebalancingTrade",
      route: {
        path: "/assets/rebalancing/sessions/:id/trades/:taskId",
        defaultHistory: (params) => [
          ...underTab("RebalancingTab")(),
          {
            activityName: "RebalancingSession" as const,
            activityParams: { id: params.id ?? "" },
          },
        ],
      },
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
    RebalancingNew: RebalancingNewActivity,
    RebalancingDetail: RebalancingDetailActivity,
    RebalancingSession: RebalancingSessionActivity,
    RebalancingTrade: RebalancingTradeActivity,
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
      // 브라우저 history 를 쌓지 않는 메모리 history. URL 은 주소창에만 반영 (next-aware-history.ts).
      history: createNextAwareHistory(),
    }),
  ],
});
