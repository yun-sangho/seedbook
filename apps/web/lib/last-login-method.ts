/**
 * 이 기기에서 마지막으로 로그인한 소셜 수단 (카카오/Apple). 로그인 화면이 그 버튼 옆에 "최근에 …로
 * 로그인했어요" 를 보여 줘, 다른 수단으로 따로 가입해 계정이 둘로 갈리는 일을 줄인다.
 *
 * 계정이 아니라 기기의 기록이라 `getDeviceStorage()` 에 둔다 (로그인 전에도 읽어야 한다).
 * 로그인에 성공했을 때만 기록한다 — 시작할 때 돌아올 주소(`callbackURL`)에 수단을 붙여 두면
 * better-auth 는 성공했을 때만 그 주소로, 실패·취소면 `errorCallbackURL` 로 보낸다.
 */

export type SocialProvider = "kakao" | "apple";

export const SOCIAL_PROVIDER_LABELS: Record<SocialProvider, string> = {
  kakao: "카카오",
  apple: "Apple",
};

export const LAST_LOGIN_METHOD_KEY = "seedbook.last-login-method";

/** 로그인 성공 뒤 돌아온 주소에 붙은 수단. */
export const SIGNED_IN_WITH_PARAM = "signedInWith";

type ItemStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

export function isSocialProvider(value: string | null | undefined): value is SocialProvider {
  return value === "kakao" || value === "apple";
}

export function signInCallbackURL(returnPath: string, provider: SocialProvider): string {
  return `${returnPath}?${new URLSearchParams({ [SIGNED_IN_WITH_PARAM]: provider })}`;
}

type Address = Pick<Location, "pathname" | "search" | "hash">;

export function signedInWithFrom({ search }: Pick<Location, "search">): SocialProvider | null {
  const value = new URLSearchParams(search).get(SIGNED_IN_WITH_PARAM);
  return isSocialProvider(value) ? value : null;
}

/** 표시를 지운 같은 주소 (경로 + 남은 쿼리 + 해시). */
export function addressWithoutSignedInWith({ pathname, search, hash }: Address): string {
  const params = new URLSearchParams(search);
  params.delete(SIGNED_IN_WITH_PARAM);
  const rest = params.toString();
  return `${pathname}${rest ? `?${rest}` : ""}${hash}`;
}

export function readLastLoginMethod(storage: Pick<ItemStorage, "getItem">): SocialProvider | null {
  const value = storage.getItem(LAST_LOGIN_METHOD_KEY);
  return isSocialProvider(value) ? value : null;
}

export function writeLastLoginMethod(storage: ItemStorage, provider: SocialProvider): void {
  storage.setItem(LAST_LOGIN_METHOD_KEY, provider);
}

/** 연결을 해제한 수단이 최근 수단이면 지운다 — 더는 그 수단으로 이 계정에 들어올 수 없다. */
export function forgetLastLoginMethod(storage: ItemStorage, provider: SocialProvider): void {
  if (readLastLoginMethod(storage) === provider) storage.removeItem(LAST_LOGIN_METHOD_KEY);
}

export function lastLoginMethodLabel(provider: SocialProvider): string {
  return `최근에 ${SOCIAL_PROVIDER_LABELS[provider]}로 로그인했어요`;
}
