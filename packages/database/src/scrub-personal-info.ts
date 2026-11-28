import { ANONYMOUS_EMAIL_DOMAIN, ANONYMOUS_USER_NAME } from "@seedbook/domain/anonymous-identity";
import { sql } from "drizzle-orm";
import type { Database } from "./client";

export interface ScrubResult {
  /** 이름·이메일·사진을 고정 값으로 바꾼 사용자 수. */
  users: number;
  /** OAuth 토큰을 지운 계정 연결 수. */
  accounts: number;
  /** 접속 IP·User-Agent 를 지운 세션 수. */
  sessions: number;
  /** User-Agent 를 지운 기기 자격 증명 수. */
  deviceCredentials: number;
}

/**
 * 이미 저장된 신상 정보를 지운다 (`anonymous-identity.ts` 의 원칙을 기존 행에 적용).
 *
 * - 소셜 계정이 있는 사용자: 이메일을 가장 먼저 연결한 소셜 계정의 고정 이메일로, 이름을 기본 이름으로,
 *   사진을 null 로 바꾼다. 이미 고정 이메일인 사용자는 건드리지 않는다 — 다시 돌려도 사용자가 나중에
 *   정한 이름·아바타를 덮어쓰지 않는다.
 * - 계정 연결: OAuth access/refresh/id 토큰과 만료 시각을 null 로.
 * - 세션: 접속 IP·User-Agent 를 null 로. 기기 자격 증명: User-Agent 를 null 로.
 *
 * 멱등 — 여러 번 돌려도 같은 결과다. 한 트랜잭션으로 돈다.
 */
export async function scrubPersonalInfo(db: Database): Promise<ScrubResult> {
  return db.transaction(async (tx) => {
    const users = await tx.execute(sql`
      WITH first_social AS (
        SELECT DISTINCT ON ("userId") "userId", "providerId", "accountId"
        FROM "seedbook"."account"
        WHERE "providerId" <> 'credential'
        ORDER BY "userId", "createdAt", "id"
      )
      UPDATE "seedbook"."user" AS u
      SET "email" = lower(f."providerId" || '-' || f."accountId" || '@' || ${ANONYMOUS_EMAIL_DOMAIN}),
          "name" = ${ANONYMOUS_USER_NAME},
          "image" = NULL,
          "emailVerified" = false,
          "updatedAt" = now()
      FROM first_social AS f
      WHERE u."id" = f."userId"
        AND u."email" NOT LIKE ${`%@${ANONYMOUS_EMAIL_DOMAIN}`}
    `);

    const accounts = await tx.execute(sql`
      UPDATE "seedbook"."account"
      SET "accessToken" = NULL,
          "refreshToken" = NULL,
          "idToken" = NULL,
          "accessTokenExpiresAt" = NULL,
          "refreshTokenExpiresAt" = NULL
      WHERE "accessToken" IS NOT NULL
         OR "refreshToken" IS NOT NULL
         OR "idToken" IS NOT NULL
         OR "accessTokenExpiresAt" IS NOT NULL
         OR "refreshTokenExpiresAt" IS NOT NULL
    `);

    const sessions = await tx.execute(sql`
      UPDATE "seedbook"."session"
      SET "ipAddress" = NULL, "userAgent" = NULL
      WHERE "ipAddress" IS NOT NULL OR "userAgent" IS NOT NULL
    `);

    const deviceCredentials = await tx.execute(sql`
      UPDATE "seedbook"."device_credential"
      SET "userAgent" = NULL
      WHERE "userAgent" IS NOT NULL
    `);

    return {
      users: users.count,
      accounts: accounts.count,
      sessions: sessions.count,
      deviceCredentials: deviceCredentials.count,
    };
  });
}
