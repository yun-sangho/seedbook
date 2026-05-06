import { db, schema } from "@seedbook/database";
import { resolveUserId } from "@web/lib/auth-server";

/**
 * 사용자별 저장소 모드 (`local` | `cloud`) 를 읽고 쓰는 엔드포인트.
 *
 * 클라이언트는 로그인 직후 GET 으로 서버 값을 받아 localStorage 와 동기화하고,
 * 사용자가 모드를 토글할 때 PUT 으로 서버에 반영한다. local 모드라도 인증된
 * 세션이 있다면 같은 사용자가 다른 기기에서 다시 cloud 로 전환할 수 있도록
 * 서버 기록 자체는 갱신한다.
 */

const VALID_MODES = new Set(["local", "cloud"]);

function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export async function GET(request: Request): Promise<Response> {
  const userId = await resolveUserId(request);
  if (!userId) return unauthorized();

  const row = await db.query.userPreference.findFirst({
    where: (t, { eq }) => eq(t.userId, userId),
    columns: { storageMode: true },
  });

  // 행이 없으면 기본 "local" — 새 사용자는 클라우드로 자동 전환되지 않는다.
  return Response.json({ storageMode: row?.storageMode ?? "local" });
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

  const mode = (body as { storageMode?: unknown })?.storageMode;
  if (typeof mode !== "string" || !VALID_MODES.has(mode)) {
    return Response.json({ error: "storageMode must be 'local' or 'cloud'" }, { status: 400 });
  }

  // user_preference 는 single-row-per-user. 다른 컬럼 (holdingsSortOption) 은
  // 보존하고 storageMode 만 갱신한다.
  await db
    .insert(schema.userPreference)
    .values({ userId, storageMode: mode })
    .onConflictDoUpdate({
      target: schema.userPreference.userId,
      set: { storageMode: mode },
    });

  return Response.json({ ok: true, storageMode: mode });
}
