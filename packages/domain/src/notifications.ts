/**
 * 알림 규칙 (서버·앱 공용). 알림은 성취 중심으로 적게 보낸다 — 하루 최대 1건, 밤(21~08시 KST)에는 보내지
 * 않는다. 문구는 계산 결과만 말한다 (사고팔라고 권하지 않는다).
 *
 * - `goal` (목표 도달): 서버 푸시. stock-crawler 가 장 마감 뒤 앱과 같은 성장 조건(`plant-goal-check.ts`)으로
 *   다음 목표에 닿았는지 읽기만 해서 판단한다 (식물 필드는 쓰지 않는다 — 자라는 것은 앱이 열릴 때 한다).
 * - `drift` (비중 이탈 n일째) · `rebalancing` (리밸런싱 할 일 남음): 기기 로컬 알림. 앱을 열 때 예약하고 바뀌면
 *   다시 예약한다.
 *
 * 알림은 클라우드에 저장(cloud 모드)할 때만 받는다 — 서버가 판단하려면 서버에 데이터가 있어야 하고, 종류마다
 * 다르게 받으면 헷갈린다.
 *
 * database 패키지가 이 파일을 import 하므로 다른 모듈을 import 하지 않는다 (`database-imports.test.ts`).
 */

export const NOTIFICATION_KINDS = ["goal", "drift", "rebalancing"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** 서버가 판단해 푸시로 보내는 종류. 기기 등록 때 켜진 것만 서버에 알린다. */
export const SERVER_NOTIFICATION_KINDS = ["goal"] as const satisfies readonly NotificationKind[];
export type ServerNotificationKind = (typeof SERVER_NOTIFICATION_KINDS)[number];

export function isServerNotificationKind(value: unknown): value is ServerNotificationKind {
  return (SERVER_NOTIFICATION_KINDS as readonly unknown[]).includes(value);
}

/** 조용한 시간 (KST). 이 시각부터 */
export const QUIET_START_HOUR = 21;
/** 이 시각 전까지 보내지 않는다. */
export const QUIET_END_HOUR = 8;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** KST 시 (0~23). */
export function kstHour(date: Date): number {
  return new Date(date.getTime() + KST_OFFSET_MS).getUTCHours();
}

/** 조용한 시간(21~08시 KST)인지. */
export function isQuietHour(date: Date): boolean {
  const hour = kstHour(date);
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

/** KST 달력일 `date` (그 시각이 속한 날) 에서 `days` 일 뒤 `hour` 시 (KST) 의 시각. */
export function kstDayAt(date: Date, days: number, hour: number): Date {
  const shifted = date.getTime() + KST_OFFSET_MS;
  const kstMidnightShifted = shifted - (((shifted % DAY_MS) + DAY_MS) % DAY_MS);
  return new Date(kstMidnightShifted - KST_OFFSET_MS + days * DAY_MS + hour * HOUR_MS);
}

// ─── 기기 알림 설정 ──────────────────────────────────────────────────────────

/** 기기 알림을 고를 수 있는 시각 (KST, 조용한 시간 밖). */
export const REMINDER_HOURS: readonly number[] = Array.from(
  { length: QUIET_START_HOUR - QUIET_END_HOUR },
  (_, i) => QUIET_END_HOUR + i
);
/** 비중이 기준을 벗어난 지 며칠째에 알릴지 고를 수 있는 값. 7일째부터 식물이 시들기 시작한다. */
export const DRIFT_REMINDER_DAYS: readonly number[] = [3, 7, 14];
/** 리밸런싱을 시작하고 할 일이 남은 채 며칠이 지나면 알릴지. */
export const REBALANCING_REMINDER_DAYS = 3;

export interface NotificationSettings {
  goal: boolean;
  drift: boolean;
  /** 비중 이탈 며칠째에 알릴지 (`DRIFT_REMINDER_DAYS`). */
  driftDays: number;
  rebalancing: boolean;
  /** 기기 알림(비중 이탈·리밸런싱)을 받을 시각 (KST, `REMINDER_HOURS`). */
  reminderHour: number;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  goal: true,
  drift: true,
  driftDays: 7,
  rebalancing: true,
  reminderHour: 19,
};

/** 저장된 값을 설정으로 읽는다. 없거나 깨진 필드는 기본값. */
export function readNotificationSettings(value: unknown): NotificationSettings {
  const raw = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  const flag = (key: "goal" | "drift" | "rebalancing") =>
    typeof raw[key] === "boolean" ? (raw[key] as boolean) : DEFAULT_NOTIFICATION_SETTINGS[key];
  const pick = (key: "driftDays" | "reminderHour", allowed: readonly number[]) =>
    allowed.includes(raw[key] as number)
      ? (raw[key] as number)
      : DEFAULT_NOTIFICATION_SETTINGS[key];
  return {
    goal: flag("goal"),
    drift: flag("drift"),
    driftDays: pick("driftDays", DRIFT_REMINDER_DAYS),
    rebalancing: flag("rebalancing"),
    reminderHour: pick("reminderHour", REMINDER_HOURS),
  };
}

/** 서버에 알릴 켜진 종류. */
export function enabledServerKinds(settings: NotificationSettings): ServerNotificationKind[] {
  return SERVER_NOTIFICATION_KINDS.filter((kind) => settings[kind]);
}

// ─── 목표 도달 (서버) ────────────────────────────────────────────────────────

/** 마지막 성장 단계 (꽃). 이 단계의 목표를 이루면 열매가 열린다. */
const LAST_PLANT_STAGE = 4;

/** 목표 도달 알림의 중복 방지 키 — 수확 주기·단계마다 한 번. */
export function goalNotificationKey(portfolioId: string, season: number, growthStage: number) {
  return `goal:${portfolioId}:${season}:${growthStage}`;
}

/** 원 → "1,200만원" (만원 미만 절삭, 앱 `numberToKorean` 과 같은 모양). */
export function wonLabel(won: number): string {
  const manwon = Math.floor(Math.abs(won) / 10000);
  if (manwon === 0) return "0원";
  const group = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const jo = Math.floor(manwon / 1_0000_0000);
  const eok = Math.floor((manwon % 1_0000_0000) / 1_0000);
  const man = manwon % 1_0000;
  const parts = [
    jo > 0 ? `${group(jo)}조` : "",
    eok > 0 ? `${group(eok)}억` : "",
    man > 0 ? `${group(man)}만` : "",
  ];
  return `${won < 0 ? "-" : ""}${parts.join("")}원`;
}

/** 알림에 쓰는 식물 이름 — 식물 이름, 없으면 포트폴리오 이름. */
export function plantNotificationLabel(plantName: string, portfolioName: string): string {
  return plantName.trim() || portfolioName.trim() || "이름 없는 포트폴리오";
}

export interface NotificationMessage {
  title: string;
  body: string;
}

export interface ReachedGoal {
  label: string;
  goalAmount: number;
  growthStage: number;
}

/** 목표 도달 알림 문구. 여러 식물이면 한 건으로 묶는다. */
export function goalReachedMessage(reached: readonly ReachedGoal[]): NotificationMessage | null {
  const [first] = reached;
  if (!first) return null;
  if (reached.length > 1) {
    return {
      title: `목표에 닿은 식물이 ${reached.length}개 있어요`,
      body: `${reached.map((r) => r.label).join(", ")} · 정원에서 확인해 보세요.`,
    };
  }
  const goal = first.growthStage >= LAST_PLANT_STAGE ? "마지막 목표" : "목표";
  return {
    title: first.label,
    body: `평가금액이 ${goal} ${wonLabel(first.goalAmount)}에 닿았어요. 정원에서 확인해 보세요.`,
  };
}
