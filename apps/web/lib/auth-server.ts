import { ACCOUNT_HEADER } from "@mobile/lib/account-header";
import { db } from "@seedbook/database";
import { auth } from "@web/lib/auth";
import { hasRequiredConsents } from "@web/server/consents/consents";
import { getLegalVersions } from "@web/server/legal/legal-versions";

/**
 * Better Auth 세션을 조회해 사용자 id 를 반환한다. 세션이 없으면 null.
 * 요청이 알린 계정(`ACCOUNT_HEADER`)이 세션과 다르면 — 다른 탭에서 계정을 바꾼 뒤 옛 탭이 보낸
 * 요청 — 역시 null 이다. 옛 계정의 데이터를 새 계정에 쓰거나 그 반대가 되지 않게 한다.
 *
 * 약관 동의는 보지 않는다 — 동의 API 만 직접 쓴다.
 */
export async function resolveSessionUserId(request: Request): Promise<string | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id ?? null;
  const expected = request.headers.get(ACCOUNT_HEADER);
  return expected !== null && expected !== userId ? null : userId;
}

/**
 * 데이터 API 를 쓸 수 있는 사용자의 id. 세션이 없거나 현재 약관에 동의하지 않았으면 null.
 *
 * API 라우트가 세션 검증을 할 때 공용으로 쓰는 헬퍼. null 이면 호출측에서 401 을 반환한다 —
 * 동기화는 401 에서 보내지 못한 변경을 대기열에 남긴다.
 */
export async function resolveUserId(request: Request): Promise<string | null> {
  const userId = await resolveSessionUserId(request);
  if (!userId) return null;
  const { versions } = await getLegalVersions();
  return (await hasRequiredConsents(db, userId, versions, new Date())) ? userId : null;
}
