import { auth } from "@web/lib/auth";

/**
 * Better Auth 세션을 조회해 사용자 id 를 반환한다. 세션이 없으면 null.
 *
 * API 라우트가 세션 검증을 할 때 공용으로 쓰는 헬퍼. 미인증이면 호출측에서
 * 401 을 반환한다.
 */
export async function resolveUserId(request: Request): Promise<string | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user?.id ?? null;
}
