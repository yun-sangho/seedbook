import { NOTIFICATION_SETTINGS_PATH } from "@mobile/features/notifications/utils/notification-links";
import type { LinkResultParams } from "@mobile/lib/login-methods";
import { type SeedPluginOptions, seedPlugin } from "@seed-design/stackflow";
import { defineConfig } from "@stackflow/config";
import { historySyncPlugin } from "@stackflow/plugin-history-sync";
import { basicRendererPlugin } from "@stackflow/plugin-renderer-basic";
import { stackflow } from "@stackflow/react";
import {
  AccountDetailActivity,
  DataBackupActivity,
  DeleteAccountActivity,
  LoginMethodsActivity,
  NotificationsActivity,
  PortfolioDetailActivity,
  PrivacyActivity,
  ProfileActivity,
  RebalancingDetailActivity,
  RebalancingNewActivity,
  RebalancingPlanActivity,
  RebalancingSessionActivity,
  RebalancingTradeActivity,
  SettingsActivity,
  StorageModeActivity,
  TabsActivity,
  TermsActivity,
} from "./activities";
import { createAddressBarHistory } from "./address-bar-history";
import { stackControlPlugin } from "./stack-control";
import { type TabKey, type TabsParams, tabOf, tabParams } from "./tabs";

/**
 * 앱 화면 스택. 하단 탭 4개는 루트 activity `Tabs` 하나에 담아
 * 탭을 옮겨도 화면이 남고(stack-control.ts 의 `switchTab`), 상세 화면은 `push` 로 쌓는다.
 *
 * URL 은 데스크탑과 같은 `/assets/...` 를 그대로 쓴다 (웹 서버가 앱 경로에 앱의 index.html 을 준다).
 * 스택은 브라우저 history 를 쌓지 않는 단일 페이지로 동작하고, 뒤로가기는 앱바 뒤로 버튼·
 * SEED 스와이프(address-bar-history.ts)와 Android 시스템 뒤로가기(lib/native/system-back.ts)다.
 * 이 모듈은 `window` 를 쓰므로 클라이언트 전용으로만 불러온다 (`mobile-stack.tsx`).
 */
declare module "@stackflow/config" {
  interface Register {
    Tabs: TabsParams;
    AccountDetail: { id: string };
    RebalancingNew: Record<string, never>;
    RebalancingDetail: { id: string };
    RebalancingPlan: { id: string };
    RebalancingSession: { id: string };
    RebalancingTrade: { id: string; taskId: string };
    PortfolioDetail: { id: string };
    Settings: Record<string, never>;
    Profile: Record<string, never>;
    StorageMode: Record<string, never>;
    DataBackup: Record<string, never>;
    Notifications: Record<string, never>;
    DeleteAccount: Record<string, never>;
    /** 버전이 없으면 지금 시행 중인 버전. */
    Terms: { version?: string };
    Privacy: { version?: string };
    /** 연결하고 돌아오면 better-auth 가 붙인 결과 쿼리 (`lib/login-methods.ts`). */
    LoginMethods: LinkResultParams;
  }
}

/** 상세 URL 로 바로 들어와도 뒤로가기가 해당 탭 목록으로 가도록 아래에 깔 화면. */
function underTab(tab: TabKey) {
  return () => [{ activityName: "Tabs" as const, activityParams: tabParams(tab) }];
}

/** 설정의 하위 화면: 바로 들어와도 뒤로가기가 설정 메뉴 → 홈으로 간다. */
function underSettings() {
  return [...underTab("home")(), { activityName: "Settings" as const, activityParams: {} }];
}

const config = defineConfig({
  activities: [
    {
      name: "AccountDetail",
      route: { path: "/assets/investments/:id", defaultHistory: underTab("investments") },
    },
    {
      name: "RebalancingNew",
      route: { path: "/assets/rebalancing/new", defaultHistory: underTab("rebalancing") },
    },
    {
      // 계좌 리밸런싱 계산. 정적 경로(`new`)가 `:id` 보다 먼저 매칭된다 (history-sync 정렬).
      name: "RebalancingDetail",
      route: { path: "/assets/rebalancing/:id", defaultHistory: underTab("rebalancing") },
    },
    {
      // 리밸런싱 2단계(거래 가능 금액·권장 매매). 바로 들어와도 뒤로가기가 1단계(현황)로 간다.
      name: "RebalancingPlan",
      route: {
        path: "/assets/rebalancing/:id/plan",
        defaultHistory: (params) => [
          ...underTab("rebalancing")(),
          {
            activityName: "RebalancingDetail" as const,
            activityParams: { id: params.id ?? "" },
          },
        ],
      },
    },
    {
      name: "RebalancingSession",
      route: {
        path: "/assets/rebalancing/sessions/:id",
        defaultHistory: underTab("rebalancing"),
      },
    },
    {
      // 매매 하나의 체결 수량·가격 입력. 바로 들어와도 뒤로가기가 그 리밸런싱으로 간다.
      name: "RebalancingTrade",
      route: {
        path: "/assets/rebalancing/sessions/:id/trades/:taskId",
        defaultHistory: (params) => [
          ...underTab("rebalancing")(),
          {
            activityName: "RebalancingSession" as const,
            activityParams: { id: params.id ?? "" },
          },
        ],
      },
    },
    {
      name: "PortfolioDetail",
      route: { path: "/assets/portfolio/:id", defaultHistory: underTab("portfolio") },
    },
    {
      name: "Settings",
      route: { path: "/assets/settings", defaultHistory: underTab("home") },
    },
    {
      // 로그인 수단 연결은 제공자 화면을 다녀와 이 주소로 돌아온다 (`lib/login-methods.ts`).
      name: "LoginMethods",
      route: { path: "/assets/settings/login-methods", defaultHistory: underSettings },
    },
    {
      name: "Profile",
      route: { path: "/assets/settings/profile", defaultHistory: underSettings },
    },
    {
      name: "StorageMode",
      route: { path: "/assets/settings/storage", defaultHistory: underSettings },
    },
    {
      name: "DataBackup",
      route: { path: "/assets/settings/data", defaultHistory: underSettings },
    },
    {
      name: "Notifications",
      route: { path: NOTIFICATION_SETTINGS_PATH, defaultHistory: underSettings },
    },
    {
      name: "DeleteAccount",
      route: { path: "/assets/settings/delete-account", defaultHistory: underSettings },
    },
    {
      // 이용약관·개인정보처리방침 (버전을 붙이면 그 버전). 사이트 `/terms`·`/privacy` 와 같은 본문.
      name: "Terms",
      route: { path: "/assets/settings/terms(/:version)", defaultHistory: underSettings },
    },
    {
      name: "Privacy",
      route: { path: "/assets/settings/privacy(/:version)", defaultHistory: underSettings },
    },
    {
      // `/assets` 와 `/assets/<탭>`. 같은 모양의 다른 경로(settings)보다 뒤에 둬야 그쪽이 먼저
      // 매칭된다. 모르는 탭은 홈으로 연다.
      name: "Tabs",
      route: { path: "/assets(/:tab)", decode: (params) => tabParams(tabOf(params)) },
    },
  ],
  transitionDuration: 350,
});

export const { Stack, actions } = stackflow({
  config,
  components: {
    Tabs: TabsActivity,
    AccountDetail: AccountDetailActivity,
    RebalancingNew: RebalancingNewActivity,
    RebalancingDetail: RebalancingDetailActivity,
    RebalancingPlan: RebalancingPlanActivity,
    RebalancingSession: RebalancingSessionActivity,
    RebalancingTrade: RebalancingTradeActivity,
    PortfolioDetail: PortfolioDetailActivity,
    Settings: SettingsActivity,
    LoginMethods: LoginMethodsActivity,
    Profile: ProfileActivity,
    StorageMode: StorageModeActivity,
    DataBackup: DataBackupActivity,
    Notifications: NotificationsActivity,
    DeleteAccount: DeleteAccountActivity,
    Terms: TermsActivity,
    Privacy: PrivacyActivity,
  },
  plugins: [
    basicRendererPlugin(),
    // 테마는 기기에 맞춘다 (`<Stack initialContext={{ theme }} />`).
    seedPlugin(({ initialContext }) => ({
      theme: (initialContext as Partial<SeedPluginOptions> | undefined)?.theme ?? "cupertino",
    })),
    stackControlPlugin,
    historySyncPlugin({
      config,
      fallbackActivity: () => "Tabs",
      // 브라우저 history 를 쌓지 않는 메모리 history. URL 은 주소창에만 반영 (address-bar-history.ts).
      history: createAddressBarHistory(),
    }),
  ],
});
