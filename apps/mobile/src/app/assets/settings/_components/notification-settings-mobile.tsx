"use client";

import { useEffect, useState } from "react";
import { IconCheckmarkLine } from "@karrotmarket/react-monochrome-icon";
import { NOTIFICATIONS_CHANGED_EVENT } from "@mobile/features/notifications/components/notification-runner";
import { useNotificationSettingsStore } from "@mobile/features/notifications/stores/notification-settings-store";
import {
  type NotificationPermission,
  notificationPermission,
  requestNotificationPermission,
} from "@mobile/lib/native/notifications";
import { getStorageMode, type StorageMode } from "@mobile/lib/storage-mode";
import {
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetRoot,
} from "@mobile/seed-design/ui/bottom-sheet";
import { Callout } from "@mobile/seed-design/ui/callout";
import { List, ListButtonItem, ListSwitchItem } from "@mobile/seed-design/ui/list";
import { SegmentedControl, SegmentedControlItem } from "@mobile/seed-design/ui/segmented-control";
import { Switchmark } from "@mobile/seed-design/ui/switch";
import { Icon } from "@seed-design/react";
import {
  DRIFT_REMINDER_DAYS,
  QUIET_END_HOUR,
  QUIET_START_HOUR,
  REBALANCING_REMINDER_DAYS,
  REMINDER_HOURS,
} from "@seedbook/domain/notifications";
import { useFlow } from "@stackflow/react";

/** 9 → "오전 9시", 12 → "낮 12시", 19 → "오후 7시". */
export function koreanHour(hour: number): string {
  if (hour < 12) return `오전 ${hour}시`;
  if (hour === 12) return "낮 12시";
  return `오후 ${hour - 12}시`;
}

function usePermission() {
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  useEffect(() => {
    let cancelled = false;
    const read = () =>
      void notificationPermission().then((value) => {
        if (!cancelled) setPermission(value);
      });
    read();
    // 설정 앱에서 바꾸고 돌아올 수 있다.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") read();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);
  return [permission, setPermission] as const;
}

/**
 * 설정 → 알림. 알림은 클라우드 저장에서만 받는다 — 이 기기에만 저장하면 안내와 저장 위치로 가는 길만 보인다.
 * 종류별로 켜고 끄고, 비중 이탈은 며칠째에·몇 시에 받을지 고른다. 설정은 이 기기에만 둔다.
 */
export function NotificationSettingsMobile() {
  const { push } = useFlow();
  const settings = useNotificationSettingsStore();
  const [permission, setPermission] = usePermission();
  const [storageMode, setStorageMode] = useState<StorageMode | null>(null);
  const [hourSheetOpen, setHourSheetOpen] = useState(false);
  useEffect(() => setStorageMode(getStorageMode()), []);

  if (storageMode === null) return null;

  if (storageMode === "local") {
    return (
      <div className="pb-x6">
        <div className="px-x4 pt-x4">
          <Callout
            tone="informative"
            description="알림은 클라우드에 저장할 때 받을 수 있어요. 목표에 닿았는지는 서버가 장 마감 뒤 계산해서 알려 드려요."
          />
        </div>
        <List>
          <ListButtonItem
            title="저장 위치 바꾸기"
            detail="이 기기에만 저장"
            onClick={() => push("StorageMode", {})}
          />
        </List>
      </div>
    );
  }

  const enable = async () => {
    const granted = await requestNotificationPermission();
    setPermission(granted ? "granted" : "denied");
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
  };

  return (
    <div className="pb-x6">
      {permission === "unavailable" && (
        <div className="px-x4 pt-x4">
          <Callout tone="informative" description="알림은 Seedbook 앱에서 받을 수 있어요." />
        </div>
      )}
      {permission === "denied" && (
        <div className="px-x4 pt-x4">
          <Callout
            tone="warning"
            description="알림이 꺼져 있어요. 휴대폰 설정 → Seedbook → 알림에서 허용해 주세요."
          />
        </div>
      )}
      <List>
        {permission === "prompt" && (
          <ListButtonItem
            title="알림 켜기"
            detail="허용하면 아래에서 고른 알림을 받아요"
            onClick={() => void enable()}
          />
        )}
        <ListSwitchItem
          suffix={<Switchmark />}
          title="목표에 닿았을 때"
          detail="평가금액이 다음 목표에 닿으면 장 마감 뒤에 알려요"
          checked={settings.goal}
          onCheckedChange={(goal) => settings.update({ goal })}
        />
        <ListSwitchItem
          suffix={<Switchmark />}
          title="비중이 기준을 벗어났을 때"
          detail={`벗어난 지 ${settings.driftDays}일째 되는 날 알려요`}
          checked={settings.drift}
          onCheckedChange={(drift) => settings.update({ drift })}
        />
      </List>
      {settings.drift && (
        <div className="px-x4 pb-x2">
          <SegmentedControl
            aria-label="며칠째에 알릴지"
            value={String(settings.driftDays)}
            onValueChange={(value) => settings.update({ driftDays: Number(value) })}
            className="w-full"
          >
            {DRIFT_REMINDER_DAYS.map((days) => (
              <SegmentedControlItem key={days} value={String(days)}>
                {days}일째
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
        </div>
      )}
      <List>
        <ListSwitchItem
          suffix={<Switchmark />}
          title="리밸런싱 할 일이 남았을 때"
          detail={`시작하고 ${REBALANCING_REMINDER_DAYS}일이 지나도 남아 있으면 알려요`}
          checked={settings.rebalancing}
          onCheckedChange={(rebalancing) => settings.update({ rebalancing })}
        />
        <ListButtonItem
          title="알림 시각"
          detail={`${koreanHour(settings.reminderHour)} · 비중·리밸런싱 알림`}
          disabled={!settings.drift && !settings.rebalancing}
          onClick={() => setHourSheetOpen(true)}
        />
      </List>
      <p className="t3-regular text-fg-neutral-subtle px-x4 pt-x2">
        밤 {QUIET_START_HOUR - 12}시부터 아침 {QUIET_END_HOUR}시까지는 보내지 않아요. 알림 설정은 이
        기기에만 적용돼요.
      </p>

      <BottomSheetRoot open={hourSheetOpen} onOpenChange={setHourSheetOpen}>
        <BottomSheetContent title="알림 시각" showHandle className="!max-h-[80dvh]">
          <BottomSheetBody>
            <List>
              {REMINDER_HOURS.map((hour) => (
                <ListButtonItem
                  key={hour}
                  title={koreanHour(hour)}
                  aria-pressed={settings.reminderHour === hour}
                  suffix={
                    settings.reminderHour === hour ? (
                      <Icon svg={<IconCheckmarkLine />} />
                    ) : undefined
                  }
                  onClick={() => {
                    settings.update({ reminderHour: hour });
                    setHourSheetOpen(false);
                  }}
                />
              ))}
            </List>
          </BottomSheetBody>
        </BottomSheetContent>
      </BottomSheetRoot>
    </div>
  );
}
