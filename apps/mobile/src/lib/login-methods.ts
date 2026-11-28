import {
  isSocialProvider,
  SOCIAL_PROVIDER_LABELS,
  type SocialProvider,
} from "@mobile/lib/last-login-method";

/**
 * "로그인 수단" 화면의 규칙. 한 사용자가 카카오·Apple 로 따로 가입해 계정이 둘로 갈리지 않게, 로그인한
 * 계정에 다른 소셜 수단을 직접 연결·해제한다 (better-auth `linkSocial`·`unlinkAccount`, 서버 설정은
 * `lib/auth-privacy.ts` 의 `privacyAccountOptions`).
 *
 * 연결은 로그인과 같은 리다이렉트 왕복이다. 성공하면 `callbackURL`, 실패·취소면 `errorCallbackURL` 에
 * better-auth 가 `error=<코드>` 를 붙여 돌려보낸다. 어떤 수단이었는지는 두 주소에 붙여 둔다.
 */

export const LOGIN_METHODS_PATH = "/assets/settings/login-methods";

const LINKED_PARAM = "linked";
const LINKING_PARAM = "linking";

/** better-auth `listAccounts` 의 행 (필요한 것만). */
export interface LinkedAccount {
  id: string;
  providerId: string;
}

export interface LoginMethodRow {
  provider: SocialProvider;
  label: string;
  /** 연결돼 있으면 better-auth account 행 id (`unlinkAccount` 에 넘긴다). */
  accountRowId: string | null;
  canUnlink: boolean;
}

const PROVIDERS: SocialProvider[] = ["kakao", "apple"];

/**
 * 화면에 보일 수단. Apple 은 서버에 설정이 없으면 숨긴다 (이미 연결돼 있으면 해제할 수 있게 보인다).
 * 이 기기에서 연결할 수 없는 수단(`available`, 번들 앱의 웹 OAuth)도 연결돼 있지 않으면 숨긴다.
 * 마지막 하나는 해제할 수 없다 — 소셜이 아닌 계정(개발용 이메일 로그인)도 하나로 센다 (서버와 같은 규칙).
 */
export function loginMethodRows(
  accounts: readonly LinkedAccount[],
  {
    appleEnabled,
    available = () => true,
  }: { appleEnabled: boolean; available?: (provider: SocialProvider) => boolean }
): LoginMethodRow[] {
  const canUnlinkAny = accounts.length > 1;
  return PROVIDERS.flatMap((provider) => {
    const linked = accounts.find((account) => account.providerId === provider);
    if (provider === "apple" && !appleEnabled && !linked) return [];
    if (!available(provider) && !linked) return [];
    return [
      {
        provider,
        label: SOCIAL_PROVIDER_LABELS[provider],
        accountRowId: linked?.id ?? null,
        canUnlink: Boolean(linked) && canUnlinkAny,
      },
    ];
  });
}

export function linkCallbackURLs(path: string, provider: SocialProvider) {
  return {
    callbackURL: `${path}?${new URLSearchParams({ [LINKED_PARAM]: provider })}`,
    errorCallbackURL: `${path}?${new URLSearchParams({ [LINKING_PARAM]: provider })}`,
  };
}

export interface LinkResult {
  provider: SocialProvider;
  /** null 이면 성공. */
  error: string | null;
}

/**
 * 돌아온 주소의 쿼리. 스택 화면은 쿼리를 activity params 로 받는다 (history sync) — 스택이 처음
 * 뒤 화면들(홈·설정)을 깔면서 주소를 잠깐 바꾸므로 `window.location` 대신 이것을 읽는다.
 */
export type LinkResultParams = Partial<Record<"linked" | "linking" | "error", string>>;

export function linkResultFrom(params: LinkResultParams): LinkResult | null {
  const linked = params[LINKED_PARAM];
  if (isSocialProvider(linked)) return { provider: linked, error: null };
  const linking = params[LINKING_PARAM];
  if (isSocialProvider(linking)) return { provider: linking, error: params.error ?? "unknown" };
  return null;
}

const CANCEL_CODES = new Set(["access_denied", "user_cancelled_authorize"]);

/** 모르는 코드는 화면에 그대로 내보내지 않는다 (주소로 아무 글이나 넣을 수 있다). */
export function linkResultMessage({ provider, error }: LinkResult): {
  tone: "positive" | "neutral";
  text: string;
} {
  const label = SOCIAL_PROVIDER_LABELS[provider];
  if (error === null) {
    return {
      tone: "positive",
      text: `${label} 계정을 연결했어요. 이제 ${label}로도 로그인할 수 있어요.`,
    };
  }
  if (error === "account_already_linked_to_different_user") {
    return {
      tone: "neutral",
      text: `이미 다른 계정에 연결된 ${label} 계정이에요. 그 계정으로 로그인하면 그 계정의 데이터를 볼 수 있어요.`,
    };
  }
  if (CANCEL_CODES.has(error)) return { tone: "neutral", text: "연결을 취소했어요." };
  return {
    tone: "neutral",
    text: `${label} 계정을 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.`,
  };
}

/** `unlinkAccount` 가 거절한 이유 (better-auth 오류 코드). */
export function unlinkErrorMessage(code: string | undefined): string {
  if (code === "SESSION_NOT_FRESH") {
    return "보안을 위해 로그인한 지 하루가 지나면 해제 전에 다시 로그인해야 해요.";
  }
  if (code === "FAILED_TO_UNLINK_LAST_ACCOUNT") return "마지막 로그인 수단은 해제할 수 없어요.";
  return "해제하지 못했어요. 잠시 뒤 다시 시도해 주세요.";
}
