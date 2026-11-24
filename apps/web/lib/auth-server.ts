import { ACCOUNT_HEADER } from "@web/lib/account-header";
import { auth } from "@web/lib/auth";

/**
 * Better Auth 세션을 조회해 사용자 id 를 반환한다. 세션이 없으면 null.
 * 요청이 알린 계정(`ACCOUNT_HEADER`)이 세션과 다르면 — 다른 탭에서 계정을 바꾼 뒤 옛 탭이 보낸
 * 요청 — 역시 null 이다. 옛 계정의 데이터를 새 계정에 쓰거나 그 반대가 되지 않게 한다.
 *
 * API 라우트가 세션 검증을 할 때 공용으로 쓰는 헬퍼. 미인증이면 호출측에서
 * 401 을 반환한다.
 */
export async function resolveUserId(request: Request): Promise<string | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id ?? null;
  const expected = request.headers.get(ACCOUNT_HEADER);
  return expected !== null && expected !== userId ? null : userId;
}
