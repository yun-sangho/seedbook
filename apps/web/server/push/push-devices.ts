import { type Database, schema } from "@seedbook/database";
import {
  isServerNotificationKind,
  type ServerNotificationKind,
} from "@seedbook/domain/notifications";
import { and, eq, sql } from "drizzle-orm";

/**
 * 푸시 알림을 받을 기기 등록 (`/api/me/push-devices`). 앱이 로그인한 세션으로 등록하고, 그 세션이 끝나면
 * (로그아웃·만료·탈퇴) 행이 지워진다 (`push_device.sessionId` → session cascade). 같은 토큰은 기기 하나라
 * 다른 계정이 등록하면 그 계정으로 옮긴다.
 */

export const PUSH_PLATFORMS = ["ios", "android"] as const;
export const PUSH_ENVIRONMENTS = ["production", "sandbox"] as const;
/** 알림을 보낼 수 있는 앱 (APNs topic). */
export const PUSH_APP_IDS = ["ing.boogie.seedbook", "ing.boogie.seedbook.dev"] as const;

export interface PushDeviceInput {
  token: string;
  platform: (typeof PUSH_PLATFORMS)[number];
  appId: (typeof PUSH_APP_IDS)[number];
  environment: (typeof PUSH_ENVIRONMENTS)[number];
  kinds: ServerNotificationKind[];
}

const TOKEN_PATTERN = /^[A-Za-z0-9:_-]{16,512}$/;

const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  (list as readonly unknown[]).includes(value);

/** 요청 본문을 읽는다. 잘못됐으면 오류 문구. */
export function parsePushDeviceInput(body: unknown): PushDeviceInput | string {
  const raw = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  if (typeof raw.token !== "string" || !TOKEN_PATTERN.test(raw.token)) return "invalid token";
  if (!oneOf(PUSH_PLATFORMS, raw.platform)) return "invalid platform";
  if (!oneOf(PUSH_APP_IDS, raw.appId)) return "invalid appId";
  if (!oneOf(PUSH_ENVIRONMENTS, raw.environment)) return "invalid environment";
  if (!Array.isArray(raw.kinds) || !raw.kinds.every(isServerNotificationKind)) {
    return "invalid kinds";
  }
  return {
    token: raw.token,
    platform: raw.platform,
    appId: raw.appId,
    environment: raw.environment,
    kinds: [...new Set(raw.kinds)],
  };
}

export async function registerPushDevice(
  db: Database,
  owner: { userId: string; sessionId: string },
  input: PushDeviceInput,
  now: Date
): Promise<void> {
  const d = schema.pushDevice;
  const values = { ...owner, ...input, updatedAt: now };
  await db
    .insert(d)
    .values({ ...values, createdAt: now })
    .onConflictDoUpdate({
      target: d.token,
      set: {
        userId: sql`excluded."userId"`,
        sessionId: sql`excluded."sessionId"`,
        platform: sql`excluded."platform"`,
        appId: sql`excluded."appId"`,
        environment: sql`excluded."environment"`,
        kinds: sql`excluded."kinds"`,
        updatedAt: now,
      },
    });
}

/** 이 사용자의 기기 토큰을 지운다 (알림 끄기·로그아웃 직전). 다른 사용자의 토큰은 건드리지 않는다. */
export async function unregisterPushDevice(
  db: Database,
  userId: string,
  token: string
): Promise<void> {
  const d = schema.pushDevice;
  await db.delete(d).where(and(eq(d.token, token), eq(d.userId, userId)));
}
