import { db } from "@seedbook/database";
import { resolveUserId } from "@web/lib/auth-server";
import { chooseStorageMode, readStorageMode } from "@web/server/preferences/storage-mode";

/**
 * 사용자별 저장소 모드 (`local` | `cloud`) 를 읽고 쓰는 엔드포인트.
 *
 * 클라이언트는 로그인 직후 GET 으로 서버 값을 받아 localStorage 와 동기화하고,
 * 사용자가 모드를 토글할 때 PUT 으로 서버에 반영한다. local 모드라도 인증된
 * 세션이 있다면 같은 사용자가 다른 기기에서 다시 cloud 로 전환할 수 있도록
 * 서버 기록 자체는 갱신한다. `onlyIfUnchosen` 은 첫 선택 화면이 보낸다 — 그 사이 다른 기기에서
 * 골랐으면 409.
 */

function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export async function GET(request: Request): Promise<Response> {
  const userId = await resolveUserId(request);
  if (!userId) return unauthorized();

  return Response.json(await readStorageMode(db, userId));
}

export async function PUT(request: Request): Promise<Response> {
  const userId = await resolveUserId(request);
  if (!userId) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const { storageMode, onlyIfUnchosen } = (body ?? {}) as {
    storageMode?: unknown;
    onlyIfUnchosen?: unknown;
  };
  if (storageMode !== "local" && storageMode !== "cloud") {
    return Response.json({ error: "storageMode must be 'local' or 'cloud'" }, { status: 400 });
  }

  const saved = await chooseStorageMode(db, userId, storageMode, new Date(), {
    onlyIfUnchosen: onlyIfUnchosen === true,
  });
  if (!saved) return Response.json({ error: "already chosen" }, { status: 409 });
  return Response.json({ ok: true, storageMode });
}
