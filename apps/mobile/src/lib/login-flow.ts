/**
 * 로그인 왕복의 규칙: 로그인 뒤(또는 취소·실패 뒤) 돌아갈 경로와 오류 안내 문구.
 *
 * 로그인 화면은 앱 경로 위에 그려지므로(`AuthGate`) 지금 경로가 곧 돌아갈 경로다. 취소·실패하면
 * better-auth 가 그 경로에 `?error=<코드>` 를 붙여 돌려보내고 로그인 화면이 안내로 바꾼다.
 */

import { APP_HOME, APP_SECTIONS } from "./device";

export const DEFAULT_RETURN_PATH = APP_HOME;

export const LOGIN_ERROR_PARAM = "error";

/**
 * 앱 화면 경로만 허용한다 (앱 구역 `APP_SECTIONS` 아래, 글자·숫자·`_`·`-` 조각). 다른 origin·`..`·인코딩·
 * 쿼리는 모두 막아 로그인 뒤 다른 곳으로 보내는 데 쓸 수 없다.
 */
const RETURN_PATH_PATTERN = new RegExp(`^(?:${APP_SECTIONS.join("|")})(?:/[A-Za-z0-9_-]+)*$`);

export function resolveReturnPath(pathname: string): string {
  // 모바일 스택은 주소 끝에 `/` 를 붙여 둔다.
  const path = pathname.replace(/\/$/, "");
  return RETURN_PATH_PATTERN.test(path) ? path : DEFAULT_RETURN_PATH;
}

const CANCELLED = "로그인을 취소했어요.";
const START_OVER = "로그인 시간이 지났거나 요청이 끊겼어요. 처음부터 다시 시도해 주세요.";
export const LOGIN_FAILED_MESSAGE = "로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.";

/** better-auth 콜백의 `error` 코드. `access_denied`·`user_cancelled_authorize` 는 카카오·Apple 이 준다. */
const LOGIN_ERROR_MESSAGES = new Map([
  ["access_denied", CANCELLED],
  ["user_cancelled_authorize", CANCELLED],
  [
    "email_not_found",
    "이메일을 받지 못해 로그인할 수 없어요. 다시 로그인할 때 이메일 제공에 동의해 주세요.",
  ],
  // 이메일로는 계정을 잇지 않으므로 (`privacyAccountOptions`) 이 코드는 연결을 해제한 수단으로 다시
  // 로그인할 때만 온다.
  [
    "account_not_linked",
    "연결을 해제한 로그인 수단이에요. 계정에 연결해 둔 다른 수단으로 로그인해 주세요.",
  ],
  ["state_mismatch", START_OVER],
  ["state_not_found", START_OVER],
  ["state_invalid", START_OVER],
]);

/** 모르는 코드는 화면에 그대로 내보내지 않는다 (주소로 아무 글이나 넣을 수 있다). */
export function loginErrorMessage(code: string | null): string | null {
  if (code === null) return null;
  return LOGIN_ERROR_MESSAGES.get(code) ?? LOGIN_FAILED_MESSAGE;
}
