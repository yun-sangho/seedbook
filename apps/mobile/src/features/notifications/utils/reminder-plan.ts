import { kstDateString } from "@seedbook/domain/kst";
import {
  kstDayAt,
  type NotificationSettings,
  REBALANCING_REMINDER_DAYS,
} from "@seedbook/domain/notifications";

/**
 * 기기 로컬 알림 계획 — 비중 이탈 n일째, 리밸런싱 할 일 남음. 앱을 열 때·자산이 바뀔 때 다시 계획해 예약을
 * 통째로 바꾼다 (`components/notification-runner.tsx`). 이미 지난 시각은 예약하지 않으므로 같은 이탈·리밸런싱으로는
 * 한 번만 울린다. 같은 날의 알림은 하나로 묶는다 (하루 최대 1건). 시각은 사용자가 고른 시(KST, 조용한 시간 밖).
 */

export interface DriftSource {
  /** 알림에 쓰는 이름 (식물 이름, 없으면 포트폴리오 이름). */
  label: string;
  /** 비중 이탈을 처음 본 시각 (KST 날짜 시작). */
  driftSince: string;
}

export interface RebalancingSource {
  /** 알림에 쓰는 이름 (계좌 이름). */
  label: string;
  startedAt: string;
  /** 남은 할 일 수. */
  remaining: number;
}

export interface LocalReminder {
  /** 예약 id — 그 날 (KST `YYYYMMDD`). */
  id: number;
  at: Date;
  title: string;
  body: string;
  /** 눌렀을 때 열 화면을 정한다 (`notification-links.ts`). 여러 종류를 묶었으면 `drift` (정원). */
  kind: "drift" | "rebalancing";
}

interface Item {
  kind: "drift" | "rebalancing";
  at: Date;
  title: string;
  body: string;
  /** 여러 개를 묶을 때의 짧은 문구. */
  short: string;
}

/** 한 번에 예약하는 최대 개수 (iOS 는 앱당 64개까지). */
const MAX_REMINDERS = 20;

export function planReminders(input: {
  settings: NotificationSettings;
  drifts: readonly DriftSource[];
  rebalancings: readonly RebalancingSource[];
  now: Date;
}): LocalReminder[] {
  const { settings, now } = input;
  const items: Item[] = [];

  if (settings.drift) {
    for (const drift of input.drifts) {
      const since = new Date(drift.driftSince);
      if (Number.isNaN(since.getTime())) continue;
      const days = settings.driftDays;
      items.push({
        kind: "drift",
        at: kstDayAt(since, days, settings.reminderHour),
        title: drift.label,
        body: `비중이 기준을 벗어난 지 ${days}일째예요. 정원에서 확인해 보세요.`,
        short: `${drift.label} 비중 이탈 ${days}일째`,
      });
    }
  }

  if (settings.rebalancing) {
    for (const session of input.rebalancings) {
      const started = new Date(session.startedAt);
      if (session.remaining <= 0 || Number.isNaN(started.getTime())) continue;
      items.push({
        kind: "rebalancing",
        at: kstDayAt(started, REBALANCING_REMINDER_DAYS, settings.reminderHour),
        title: session.label,
        body: `리밸런싱 할 일이 ${session.remaining}개 남았어요.`,
        short: `${session.label} 리밸런싱 할 일 ${session.remaining}개`,
      });
    }
  }

  const byDay = new Map<string, Item[]>();
  for (const item of items) {
    if (item.at.getTime() <= now.getTime()) continue;
    const day = kstDateString(item.at);
    byDay.set(day, [...(byDay.get(day) ?? []), item]);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, MAX_REMINDERS)
    .map(([day, dayItems]) => {
      const [first] = dayItems as [Item, ...Item[]];
      const merged = dayItems.length > 1;
      return {
        id: Number(day.replaceAll("-", "")),
        at: first.at,
        title: merged ? `확인할 것이 ${dayItems.length}개 있어요` : first.title,
        body: merged ? dayItems.map((item) => item.short).join(" · ") : first.body,
        kind: dayItems.every((item) => item.kind === first.kind) ? first.kind : "drift",
      };
    });
}
