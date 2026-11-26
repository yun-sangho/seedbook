import { db } from "@seedbook/database";
import { resolveSessionUserId } from "@web/lib/auth-server";
import { consentStatus, deleteNewSignUp, recordConsents } from "@web/server/consents/consents";
import { getLegalVersions } from "@web/server/legal/legal-versions";

/**
 * 약관·개인정보 동의. 동의 전에 부르는 유일한 데이터 API 라 동의를 요구하지 않는다.
 *
 * - `GET`: 동의했으면 `{ agreed: true, notices }` (시행일 전 안내할 개정), 아니면
 *   `{ agreed: false, newSignUp, documents }` (거부하면 계정이 지워지는 새 가입인지, 동의할 문서).
 * - `POST { versions }`: 동의 기록. 화면이 보여 준 버전이 지금과 다르면 409.
 * - `DELETE`: 동의 거부. 방금 만든 계정이면 지운다. 로그아웃은 클라이언트가 이어서 한다.
 */

function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export async function GET(request: Request): Promise<Response> {
  const userId = await resolveSessionUserId(request);
  if (!userId) return unauthorized();

  const { versions } = await getLegalVersions();
  return Response.json(await consentStatus(db, userId, versions, new Date()));
}

export async function POST(request: Request): Promise<Response> {
  const userId = await resolveSessionUserId(request);
  if (!userId) return unauthorized();

  const body = (await request.json().catch(() => null)) as { versions?: unknown } | null;
  const { versions } = await getLegalVersions();
  const recorded = await recordConsents(db, userId, body?.versions, versions, new Date());
  if (!recorded) return Response.json({ error: "documents changed" }, { status: 409 });
  return Response.json({ agreed: true });
}

export async function DELETE(request: Request): Promise<Response> {
  const userId = await resolveSessionUserId(request);
  if (!userId) return unauthorized();

  return Response.json({ deleted: await deleteNewSignUp(db, userId, new Date()) });
}
