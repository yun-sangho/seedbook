"use client";

import type { LocalReminder } from "@mobile/features/notifications/utils/reminder-plan";
import { accountFetch } from "@mobile/lib/account-storage";
import { getDeviceStorage } from "@mobile/lib/device-storage";
import type { ServerNotificationKind } from "@seedbook/domain/notifications";

/**
 * 네이티브 앱 알림 래퍼 — 원격 푸시(`@capacitor/push-notifications`, 지금은 iOS APNs 만)와 기기 로컬 알림
 * (`@capacitor/local-notifications`). 브라우저에서는 모두 "쓸 수 없음" 으로 끝난다. 플러그인은 필요할 때만
 * 불러온다. Android 원격 푸시(FCM)는 Firebase 계정이 생긴 뒤 — 그때까지 Android 는 로컬 알림만.
 *
 * 기기 토큰은 로그인한 세션으로 서버(`/api/me/push-devices`)에 등록하고, 서버는 그 세션이 끝나면 지운다.
 */

export type NotificationPermission = "granted" | "denied" | "prompt" | "unavailable";

/** 서버에 등록한 이 기기의 토큰 (로그아웃할 때 지운다). 계정과 무관한 기기 값. */
const PUSH_TOKEN_KEY = "seedbook.pushToken";
const REGISTER_TIMEOUT_MS = 10_000;

// 플러그인 Proxy 는 `.then` 도 네이티브 호출로 바꾼다 — 그대로 돌려주면 await 가 멈춘다. 객체로 감싼다.
async function native() {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return null;
  const [{ PushNotifications }, { LocalNotifications }] = await Promise.all([
    import("@capacitor/push-notifications"),
    import("@capacitor/local-notifications"),
  ]);
  const platform = Capacitor.getPlatform();
  return {
    push: PushNotifications,
    local: LocalNotifications,
    /** 원격 푸시를 받을 수 있는 플랫폼. */
    remote: platform === "ios",
    platform: platform as "ios" | "android",
  };
}

function toPermission(state: string): NotificationPermission {
  if (state === "granted") return "granted";
  if (state === "denied") return "denied";
  return "prompt";
}

/** 알림 권한. iOS 는 원격·로컬이 한 권한이다. */
export async function notificationPermission(): Promise<NotificationPermission> {
  try {
    const plugins = await native();
    if (!plugins) return "unavailable";
    if (plugins.remote) return toPermission((await plugins.push.checkPermissions()).receive);
    return toPermission((await plugins.local.checkPermissions()).display);
  } catch {
    return "unavailable";
  }
}

/** 시스템 권한 팝업을 띄운다 (이미 정했으면 그 값). 허용하면 true. */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const plugins = await native();
    if (!plugins) return false;
    if (plugins.remote) return (await plugins.push.requestPermissions()).receive === "granted";
    return (await plugins.local.requestPermissions()).display === "granted";
  } catch {
    return false;
  }
}

/** APNs 에서 이 기기의 토큰을 받는다 (권한이 있어야 한다). 실패하면 null. */
async function deviceToken(
  push: NonNullable<Awaited<ReturnType<typeof native>>>["push"]
): Promise<string | null> {
  return new Promise((resolve) => {
    const handles: Promise<{ remove: () => Promise<void> }>[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (token: string | null) => {
      clearTimeout(timer);
      for (const handle of handles) void handle.then((h) => h.remove()).catch(() => undefined);
      resolve(token);
    };
    handles.push(push.addListener("registration", (token) => finish(token.value)));
    handles.push(push.addListener("registrationError", () => finish(null)));
    timer = setTimeout(() => finish(null), REGISTER_TIMEOUT_MS);
    push.register().catch(() => finish(null));
  });
}

/** 앱 번들 ID 와 APNs 환경 (개발용 앱 Seedbook Dev 는 sandbox). */
async function appIdentity(): Promise<{ appId: string; environment: "production" | "sandbox" }> {
  const { App } = await import("@capacitor/app");
  const { id } = await App.getInfo();
  return { appId: id, environment: id.endsWith(".dev") ? "sandbox" : "production" };
}

/** 서버에 등록한 이 기기의 토큰을 지운다 (없으면 아무것도 하지 않는다). */
async function forgetPushDevice(): Promise<void> {
  const storage = getDeviceStorage();
  const token = storage.getItem(PUSH_TOKEN_KEY);
  if (!token) return;
  const response = await accountFetch("/api/me/push-devices", {
    method: "DELETE",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (response.ok) storage.removeItem(PUSH_TOKEN_KEY);
}

/**
 * 이 기기를 원격 푸시에 등록한다 — 서버가 보내는 종류 중 켠 것(`kinds`)과 함께. 켠 종류가 없거나 알림 권한이
 * 없으면 서버의 등록을 지운다 (개인정보처리방침: 알림을 끄면 토큰을 지운다). 원격 푸시를 못 받는 플랫폼이면
 * 아무것도 하지 않는다. 실패는 다음 실행 때 다시 한다.
 */
export async function registerPushDevice(kinds: ServerNotificationKind[]): Promise<boolean> {
  try {
    const plugins = await native();
    if (!plugins?.remote) return false;
    const granted = (await plugins.push.checkPermissions()).receive === "granted";
    if (!granted || kinds.length === 0) {
      await forgetPushDevice();
      return false;
    }
    const token = await deviceToken(plugins.push);
    if (!token) return false;
    const response = await accountFetch("/api/me/push-devices", {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, platform: plugins.platform, ...(await appIdentity()), kinds }),
    });
    if (!response.ok) return false;
    getDeviceStorage().setItem(PUSH_TOKEN_KEY, token);
    return true;
  } catch {
    return false;
  }
}

/** 예약한 로컬 알림을 이 계획으로 바꾼다 (빈 계획이면 모두 취소). */
export async function scheduleReminders(reminders: readonly LocalReminder[]): Promise<void> {
  try {
    const plugins = await native();
    if (!plugins) return;
    const { notifications: pending } = await plugins.local.getPending();
    if (pending.length > 0) {
      await plugins.local.cancel({ notifications: pending.map(({ id }) => ({ id })) });
    }
    if (reminders.length === 0) return;
    if ((await plugins.local.checkPermissions()).display !== "granted") return;
    await plugins.local.schedule({
      notifications: reminders.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        schedule: { at: r.at, allowWhileIdle: true },
        extra: { kind: r.kind },
      })),
    });
  } catch (error) {
    console.warn("[seedbook] local reminders", error);
  }
}

/**
 * 알림(원격 푸시·로컬)을 눌러 앱을 열었을 때 그 알림의 종류(`kind`)로 `handler` 를 부른다. 돌려준 함수로 뗀다.
 */
export async function onNotificationTap(handler: (kind: string | undefined) => void) {
  const plugins = await native().catch(() => null);
  if (!plugins) return () => undefined;
  const handles = await Promise.all([
    plugins.push.addListener("pushNotificationActionPerformed", (action) => {
      const kind: unknown = action.notification.data?.kind;
      handler(typeof kind === "string" ? kind : undefined);
    }),
    plugins.local.addListener("localNotificationActionPerformed", (action) => {
      const kind: unknown = action.notification.extra?.kind;
      handler(typeof kind === "string" ? kind : undefined);
    }),
  ]);
  return () => {
    for (const handle of handles) void handle.remove();
  };
}

/**
 * 로그아웃 직전: 서버의 기기 등록을 지우고(세션이 끝나면 서버도 지우지만 서버에 닿지 못할 수 있다) 이 기기의
 * 원격 푸시 등록과 예약한 로컬 알림을 끊는다 — 다음 사람이 이 기기에서 앞 계정의 알림을 받지 않게.
 */
export async function stopNotificationsOnSignOut(): Promise<void> {
  try {
    const plugins = await native();
    if (!plugins) return;
    await forgetPushDevice().catch(() => undefined);
    // 서버에 닿지 못했어도 세션이 끝나면 서버가 지운다 — 이 기기의 기록은 비운다.
    getDeviceStorage().removeItem(PUSH_TOKEN_KEY);
    if (plugins.remote) await plugins.push.unregister().catch(() => undefined);
    await scheduleReminders([]);
  } catch {
    // 로그아웃은 막지 않는다.
  }
}
