import { APP_HOME } from "@mobile/lib/device";
import type { NotificationKind } from "@seedbook/domain/notifications";

/**
 * 알림이 여는 화면 — 알림 설정 화면 경로와, 알림을 눌렀을 때 갈 곳을 여기 한 곳에 둔다. 앱 경로가 바뀌면
 * 이 파일만 고친다 (경로 규칙은 `lib/device.ts`).
 */

/** 설정 → 알림 화면 경로 (`app/_stack/stackflow.ts` 의 `Notifications`). */
export const NOTIFICATION_SETTINGS_PATH = "/settings/notifications";

export interface NotificationTarget {
  /** 앱 경로 (지금 화면 구조에서의 주소). */
  path: string;
  /** 지금 스택에서 열 하단 탭. */
  tab: "home" | "rebalancing";
}

const HOME: NotificationTarget = { path: APP_HOME, tab: "home" };
const REBALANCING: NotificationTarget = { path: "/rebalancing", tab: "rebalancing" };

/** 알림 종류 → 눌렀을 때 열 화면. 목표·비중은 정원(홈), 리밸런싱은 리밸런싱 탭. 모르는 값은 홈. */
export function notificationTarget(
  kind: NotificationKind | string | undefined
): NotificationTarget {
  return kind === "rebalancing" ? REBALANCING : HOME;
}
