import { db, schema } from "./client";
import {
  DEV_SESSION_ID,
  DEV_SESSION_TOKEN,
  DEV_USER_EMAIL,
  DEV_USER_ID,
  DEV_USER_NAME,
} from "./dev-auth";

/**
 * 개발 전용 dev 유저 + 고정 토큰 세션을 보장한다 (멱등 upsert).
 *
 * seed 와 `/api/auth/dev-login` 이 함께 쓴다. 로그아웃하면 Better Auth 가 세션 행을
 * 지우므로, dev-login 이 매번 이걸 불러 세션을 되살린다. 유저는 이미 있으면 건드리지
 * 않고, 세션은 만료일만 갱신한다. 호출측이 개발 환경인지 확인해야 한다.
 */
export async function ensureDevAuth(): Promise<void> {
  const now = new Date();
  const farFuture = new Date("2100-01-01T00:00:00Z");

  await db
    .insert(schema.user)
    .values({
      id: DEV_USER_ID,
      email: DEV_USER_EMAIL,
      name: DEV_USER_NAME,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  await db
    .insert(schema.session)
    .values({
      id: DEV_SESSION_ID,
      userId: DEV_USER_ID,
      token: DEV_SESSION_TOKEN,
      expiresAt: farFuture,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.session.id,
      set: { expiresAt: farFuture, updatedAt: now },
    });
}
