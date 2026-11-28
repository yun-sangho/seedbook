/**
 * 회원 탈퇴. 서버(better-auth `/delete-user`)가 user 행을 지우면 모든 자산 테이블이
 * cascade 로 함께 지워진다. local 모드 데이터는 이 기기(브라우저 localStorage, 네이티브 앱
 * SQLite)에만 있으므로 성공하면 여기서 비운다.
 *
 * better-auth 는 세션이 `freshAge`(기본 1일) 보다 오래됐으면 `SESSION_EXPIRED` 로
 * 거절한다 — 다시 로그인해 새 세션으로 시도해야 한다.
 */

export type DeleteAccountResult = "deleted" | "reauth-required" | "failed";

interface DeleteUserClient {
  deleteUser: () => Promise<{ error?: { code?: string } | null } | null | undefined>;
}

const SESSION_EXPIRED_CODE = "SESSION_EXPIRED";

export async function deleteAccount(
  client: DeleteUserClient,
  storage: { clear: () => void | Promise<void> }
): Promise<DeleteAccountResult> {
  let response: Awaited<ReturnType<DeleteUserClient["deleteUser"]>>;
  try {
    response = await client.deleteUser();
  } catch {
    return "failed";
  }

  const error = response?.error;
  if (error) {
    return error.code === SESSION_EXPIRED_CODE ? "reauth-required" : "failed";
  }

  await storage.clear();
  return "deleted";
}
