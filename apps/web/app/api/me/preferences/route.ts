import {
  invalidPreferenceKeys,
  parseAccountPreferences,
} from "@mobile/features/settings/utils/account-preferences";
import { db } from "@seedbook/database";
import { resolveUserId } from "@web/lib/auth-server";
import {
  readAccountPreferences,
  writeAccountPreferences,
} from "@web/server/preferences/preferences";

/**
 * 사용자 화면 설정을 읽고 쓰는 엔드포인트. 저장소 모드(local/cloud)와 상관없이 계정에 저장한다.
 * 다루는 항목은 `AccountPreferences` (리밸런싱 매매 정렬·접힘, 계좌 목록 정렬, 포트폴리오 종목
 * 정렬, 투자 추이 기간). PUT 은 보낸 항목만 바꾼다.
 */

function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export async function GET(request: Request): Promise<Response> {
  const userId = await resolveUserId(request);
  if (!userId) return unauthorized();

  return Response.json(await readAccountPreferences(db, userId));
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

  const invalid = invalidPreferenceKeys(body);
  if (invalid.length > 0) {
    return Response.json({ error: `invalid ${invalid.join(", ")}` }, { status: 400 });
  }
  // 없어진 섹션 이름은 버리고 저장한다 — 목록이 아닐 때만 거절.
  const changes = parseAccountPreferences(body);
  if (Object.keys(changes).length === 0) {
    return Response.json({ error: "nothing to update" }, { status: 400 });
  }

  await writeAccountPreferences(db, userId, changes);
  return Response.json({ ok: true });
}
