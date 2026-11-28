import { db } from "@seedbook/database";
import { resolveUserSession } from "@web/lib/auth-server";
import {
  parsePushDeviceInput,
  registerPushDevice,
  unregisterPushDevice,
} from "@web/server/push/push-devices";

/**
 * 푸시 알림을 받을 기기 (네이티브 앱). PUT 은 이 세션으로 기기 토큰과 켠 종류를 등록하고(같은 토큰이면
 * 바꾼다), DELETE 는 이 사용자의 그 토큰을 지운다. 세션이 끝나면 등록도 함께 지워진다.
 */

function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

async function readBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export async function PUT(request: Request): Promise<Response> {
  const owner = await resolveUserSession(request);
  if (!owner) return unauthorized();

  const input = parsePushDeviceInput(await readBody(request));
  if (typeof input === "string") return Response.json({ error: input }, { status: 400 });

  await registerPushDevice(db, owner, input, new Date());
  return Response.json({ ok: true });
}

export async function DELETE(request: Request): Promise<Response> {
  const owner = await resolveUserSession(request);
  if (!owner) return unauthorized();

  const body = (await readBody(request)) as { token?: unknown } | undefined;
  if (typeof body?.token !== "string" || body.token.length === 0) {
    return Response.json({ error: "invalid token" }, { status: 400 });
  }
  await unregisterPushDevice(db, owner.userId, body.token);
  return Response.json({ ok: true });
}
