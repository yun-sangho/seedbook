import { randomUUID } from "node:crypto";
import {
  type Database,
  type PushMessage,
  type PushSender,
  type PushTarget,
  schema,
} from "@seedbook/database";

/** 테스트 세션 (`push_device.sessionId` 가 가리킨다). */
export async function createTestSession(db: Database, userId: string): Promise<string> {
  const id = randomUUID();
  const now = new Date();
  await db.insert(schema.session).values({
    id,
    userId,
    token: randomUUID(),
    expiresAt: new Date(now.getTime() + 86_400_000),
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/** 보낸 것을 기록하는 가짜 발송기. `unregistered` 에 넣은 토큰은 지워진 기기로 답한다. */
export function fakeSender(unregistered: string[] = []) {
  const sent: { target: PushTarget; message: PushMessage }[] = [];
  const sender: PushSender = {
    async send(target, message) {
      if (unregistered.includes(target.token)) return "unregistered";
      sent.push({ target, message });
      return "sent";
    },
    close() {},
  };
  return { sender, sent };
}

export function testToken(): string {
  return randomUUID().replaceAll("-", "").repeat(2);
}
