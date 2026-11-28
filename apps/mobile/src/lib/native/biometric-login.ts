/**
 * 생체 인증 로그인 흐름 (네이티브 앱). 서버가 발급한 기기 토큰을 Keychain (iOS) / Keystore
 * (Android) 에 생체 인증으로 잠가 두고, 세션이 없을 때 생체 인증으로 꺼내 다시 로그인한다.
 * 서버 쪽은 `server/device-credentials/`.
 *
 * - 금고(`BiometricVault`) 의 토큰은 하드웨어가 생체 인증을 강제한다 — 인증 결과(true/false)만
 *   믿는 앱 잠금과 달리 JS 가 인증 없이 토큰을 꺼낼 수 없다.
 * - 생체 정보가 바뀌면 (`BIOMETRY_CURRENT_SET`) 금고 항목이 무효가 된다. 그때와 서버가 거절할 때
 *   (만료·폐기) 는 이 기기의 등록을 지우고 카카오/Apple 로그인으로 돌아간다.
 * - 로그아웃해도 등록은 남는다 — 다음 로그인을 생체 인증으로 하기 위한 기능이다. 끄기는 설정에서.
 * - 기기 저장소에는 어느 자격 증명이 누구 것인지만 둔다 (토큰은 금고에만).
 */

export const BIOMETRIC_LOGIN_STORAGE_KEY = "seedbook.biometric-login";

export type BiometricFailure = "cancelled" | "invalidated" | "unavailable" | "error";

export interface BiometricVault {
  platform: "ios" | "android";
  /** 생체 인증만 요청한다 (iOS 는 Keychain 저장 때 프롬프트가 없어 등록 전에 따로 확인한다). */
  verify(reason: string): Promise<boolean>;
  /** 생체 인증으로 잠가 저장한다. Android 는 저장할 때도 프롬프트가 뜬다. */
  save(credential: { credentialId: string; token: string }): Promise<boolean>;
  read(
    reason: string
  ): Promise<
    { ok: true; credentialId: string; token: string } | { ok: false; failure: BiometricFailure }
  >;
  remove(): Promise<void>;
  /** 금고에 항목이 남아 있는지 (프롬프트 없이). */
  exists(): Promise<boolean>;
}

type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface BiometricLoginDeps {
  vault: BiometricVault;
  /** `/api/auth` 아래 경로로 POST. 네트워크 오류는 throw. */
  request: (path: string, body?: unknown) => Promise<{ status: number; body: unknown }>;
  storage: KeyValueStorage;
}

export interface BiometricLoginEnrollment {
  credentialId: string;
  userId: string;
}

export function readBiometricLoginEnrollment(
  storage: KeyValueStorage
): BiometricLoginEnrollment | null {
  try {
    const raw = storage.getItem(BIOMETRIC_LOGIN_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<BiometricLoginEnrollment>;
    if (typeof value.credentialId !== "string" || typeof value.userId !== "string") return null;
    return { credentialId: value.credentialId, userId: value.userId };
  } catch {
    return null;
  }
}

function writeEnrollment(storage: KeyValueStorage, enrollment: BiometricLoginEnrollment): void {
  storage.setItem(BIOMETRIC_LOGIN_STORAGE_KEY, JSON.stringify(enrollment));
}

function clearEnrollment(storage: KeyValueStorage): void {
  storage.removeItem(BIOMETRIC_LOGIN_STORAGE_KEY);
}

// `@capgo/capacitor-native-biometric` 의 BiometricAuthError 코드.
const CANCELLED_CODES = new Set(["10", "11", "15", "16", "17"]);
const UNAVAILABLE_CODES = new Set(["1", "2", "3", "4", "14"]);
const NO_PROTECTED_CREDENTIALS_CODE = "21";
// Android 는 생체 정보가 바뀌어 Keystore 키가 무효가 되면 코드 0 과 이 메시지로 거절한다.
const ENROLLMENT_CHANGED_MESSAGE = /enrollment changed/i;

export function classifyBiometricError(error: unknown): BiometricFailure {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  const codeText = code === undefined || code === null ? "" : String(code);
  if (codeText === NO_PROTECTED_CREDENTIALS_CODE) return "invalidated";
  if (typeof message === "string" && ENROLLMENT_CHANGED_MESSAGE.test(message)) {
    return "invalidated";
  }
  if (CANCELLED_CODES.has(codeText)) return "cancelled";
  if (UNAVAILABLE_CODES.has(codeText)) return "unavailable";
  return "error";
}

const ENROLL_REASON = "생체 인증 로그인을 켭니다";
const SIGN_IN_REASON = "Seedbook 에 로그인합니다";

export type EnrollResult = "enrolled" | "cancelled" | "reauth-required" | "failed";

function isIssuedCredential(body: unknown): body is { credentialId: string; token: string } {
  const value = body as { credentialId?: unknown; token?: unknown } | null;
  return typeof value?.credentialId === "string" && typeof value?.token === "string";
}

/** 로그인한 사용자(`userId`) 로 이 기기에 생체 인증 로그인을 켠다. 이전 등록은 바꾼다. */
export async function enrollBiometricLogin(
  deps: BiometricLoginDeps,
  userId: string
): Promise<EnrollResult> {
  const { vault, request, storage } = deps;
  if (vault.platform === "ios" && !(await vault.verify(ENROLL_REASON))) return "cancelled";

  let issued: { credentialId: string; token: string };
  try {
    const response = await request("/device-credential/enroll");
    // freshSessionMiddleware: 로그인한 지 오래된 세션은 403.
    if (response.status === 403) return "reauth-required";
    if (response.status !== 200 || !isIssuedCredential(response.body)) return "failed";
    issued = response.body;
  } catch {
    return "failed";
  }

  if (!(await vault.save(issued))) {
    await request("/device-credential/revoke", { credentialId: issued.credentialId }).catch(
      () => {}
    );
    return "cancelled";
  }

  const previous = readBiometricLoginEnrollment(storage);
  writeEnrollment(storage, { credentialId: issued.credentialId, userId });
  if (previous && previous.userId === userId) {
    await request("/device-credential/revoke", { credentialId: previous.credentialId }).catch(
      () => {}
    );
  }
  return "enrolled";
}

export type SignInResult = "signed-in" | "cancelled" | "invalidated" | "unavailable" | "failed";

/** 금고의 토큰으로 로그인한다. 성공하면 세션 쿠키가 걸려 있다. */
export async function signInWithBiometricLogin(deps: BiometricLoginDeps): Promise<SignInResult> {
  const { vault, request, storage } = deps;
  const credential = await vault.read(SIGN_IN_REASON);
  if (!credential.ok) {
    // 플랫폼마다 무효가 된 항목을 알리는 방식이 다르다 (Android 는 생체 정보가 바뀌면 항목을 지우고
    // 코드 0 으로 거절한다). 원인을 모르는 오류면 항목이 아직 있는지로 판단한다.
    const invalidated =
      credential.failure === "invalidated" ||
      (credential.failure === "error" && !(await vault.exists().catch(() => true)));
    if (invalidated) {
      clearEnrollment(storage);
      return "invalidated";
    }
    return credential.failure === "error" ? "failed" : credential.failure;
  }

  let status: number;
  try {
    ({ status } = await request("/device-credential/sign-in", {
      credentialId: credential.credentialId,
      token: credential.token,
    }));
  } catch {
    return "failed";
  }
  if (status === 200) return "signed-in";
  if (status === 401) {
    // 만료됐거나 다른 기기·설정에서 폐기됐다 — 이 기기의 등록도 지운다.
    await vault.remove();
    clearEnrollment(storage);
    return "invalidated";
  }
  return "failed";
}

/** 이 기기의 생체 인증 로그인을 끈다. 서버에 닿지 않아도 기기 쪽은 지운다. */
export async function disableBiometricLogin(deps: BiometricLoginDeps): Promise<void> {
  const { vault, request, storage } = deps;
  const enrollment = readBiometricLoginEnrollment(storage);
  if (enrollment) {
    await request("/device-credential/revoke", { credentialId: enrollment.credentialId }).catch(
      () => {}
    );
  }
  await vault.remove();
  clearEnrollment(storage);
}

const OFFER_DISMISSED_STORAGE_KEY = "seedbook.biometric-login.offer-dismissed";
// 서버는 로그인한 지 freshAge (기본 1일) 가 지난 세션의 등록을 거절한다. 여유를 두고 그보다 짧게.
const OFFER_SESSION_WINDOW_MS = 23 * 60 * 60 * 1000;

/** 이 기기가 `userId` 로 생체 인증 로그인을 켜 두었는지. */
export function isBiometricLoginEnrolledFor(storage: KeyValueStorage, userId: string): boolean {
  return readBiometricLoginEnrollment(storage)?.userId === userId;
}

/** 로그인 직후 "다음부터 생체 인증으로 로그인할까요?" 를 물을지. "나중에" 를 고르면 다시 묻지 않는다. */
export function shouldOfferBiometricLogin(
  storage: KeyValueStorage,
  input: { userId: string; sessionCreatedAt: Date; now: Date }
): boolean {
  if (isBiometricLoginEnrolledFor(storage, input.userId)) return false;
  if (storage.getItem(OFFER_DISMISSED_STORAGE_KEY) === "1") return false;
  return input.now.getTime() - input.sessionCreatedAt.getTime() < OFFER_SESSION_WINDOW_MS;
}

export function dismissBiometricLoginOffer(storage: KeyValueStorage): void {
  storage.setItem(OFFER_DISMISSED_STORAGE_KEY, "1");
}

const SIGNED_OUT_STORAGE_KEY = "seedbook.signed-out";

/**
 * 직접 로그아웃했다는 표시. 로그인 화면은 앱을 열 때 생체 인증 프롬프트를 자동으로 띄우는데,
 * 방금 로그아웃한 사람에게는 띄우지 않는다. 로그아웃 직후 로그인 화면이 다시 그려지고 페이지도
 * 새로 고쳐지므로 읽어도 지우지 않고, 다시 로그인했을 때 지운다. 앱을 끄면 사라지는 저장소
 * (sessionStorage) 에 둔다.
 */
export function markSignedOut(storage: KeyValueStorage): void {
  try {
    storage.setItem(SIGNED_OUT_STORAGE_KEY, "1");
  } catch {
    // 저장하지 못하면 프롬프트가 한 번 더 뜰 뿐이다.
  }
}

export function isSignedOutMarked(storage: KeyValueStorage): boolean {
  try {
    return storage.getItem(SIGNED_OUT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearSignedOutMark(storage: KeyValueStorage): void {
  try {
    storage.removeItem(SIGNED_OUT_STORAGE_KEY);
  } catch {
    // 남아 있으면 이 앱 세션 동안 자동 프롬프트가 뜨지 않을 뿐이다.
  }
}
