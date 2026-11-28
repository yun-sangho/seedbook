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

import { isAppLockEnabled, setAppLockEnabled } from "./app-lock";

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

/**
 * 로그인한 사용자(`userId`) 로 이 기기에 생체 인증 로그인을 켠다. 이전 등록은 바꾼다.
 * `verified`: 방금 생체 인증을 통과했다 — iOS 에서 한 번 더 묻지 않는다.
 */
export async function enrollBiometricLogin(
  deps: BiometricLoginDeps,
  userId: string,
  options: { verified?: boolean } = {}
): Promise<EnrollResult> {
  const { vault, request, storage } = deps;
  if (vault.platform === "ios" && !options.verified && !(await vault.verify(ENROLL_REASON))) {
    return "cancelled";
  }

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

async function vaultHoldsToken(vault: BiometricVault): Promise<boolean> {
  try {
    return await vault.exists();
  } catch {
    return false;
  }
}

/**
 * 이 기기에 생체 인증 로그인 토큰이 있는지 (로그인 화면 버튼·자동 프롬프트). 금고(Keychain/Keystore)
 * 를 기준으로 본다 — 금고가 비었으면 기기 저장소의 등록 표시도 지운다. 누구의 것인지 표시가 없어도
 * 금고에 토큰이 있으면 그 토큰으로 로그인할 수 있다.
 */
export async function hasBiometricLoginOnDevice(deps: BiometricLoginDeps): Promise<boolean> {
  if (await vaultHoldsToken(deps.vault)) return true;
  if (readBiometricLoginEnrollment(deps.storage)) clearEnrollment(deps.storage);
  return false;
}

/**
 * 설정에 보일 상태: 이 계정(`userId`)으로 켰고 금고에 토큰이 남아 있을 때만 켜짐. 금고가 비었으면
 * 등록 표시를 지운다 (생체 정보가 바뀌었거나, 다른 키로 저장된 옛 항목이거나, 앱을 다시 설치했다).
 */
export async function biometricLoginEnabledFor(
  deps: BiometricLoginDeps,
  userId: string
): Promise<boolean> {
  if (!(await hasBiometricLoginOnDevice(deps))) return false;
  return isBiometricLoginEnrolledFor(deps.storage, userId);
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

/*
 * 설정의 "Face ID 사용" 스위치 하나로 앱 잠금과 생체 인증 로그인을 함께 켜고 끈다 (2026-11-28 사용자 결정).
 * 앱 잠금은 기기 단위, 생체 인증 로그인은 계정 단위다.
 */

const PROTECTION_REASON = "Face ID로 앱 잠금과 로그인을 켭니다";

export type ProtectionResult = { status: "cancelled" } | { status: "enabled"; login: EnrollResult };

/** 생체 인증을 한 번 통과하면 앱 잠금을 켜고 생체 인증 로그인을 등록한다. 로그인 등록이 실패해도 잠금은 켠다. */
export async function enableBiometricProtection(
  deps: BiometricLoginDeps,
  userId: string
): Promise<ProtectionResult> {
  if (!(await deps.vault.verify(PROTECTION_REASON))) return { status: "cancelled" };
  setAppLockEnabled(deps.storage, true);
  const login = await enrollBiometricLogin(deps, userId, { verified: true });
  return { status: "enabled", login };
}

/** 앱 잠금을 끄고, 이 계정의 생체 인증 로그인을 끈다 (다른 계정의 등록은 그대로). */
export async function disableBiometricProtection(
  deps: BiometricLoginDeps,
  userId: string
): Promise<void> {
  setAppLockEnabled(deps.storage, false);
  if (isBiometricLoginEnrolledFor(deps.storage, userId)) await disableBiometricLogin(deps);
}

/**
 * 스위치에 보일 상태: 앱 잠금이나 이 계정의 생체 인증 로그인 중 하나라도 켜져 있으면 켜짐. 예전에
 * 로그인만 켜 둔 기기는 잠금도 켠다 (두 설정을 합치기 전에 켠 것).
 */
export async function biometricProtectionEnabledFor(
  deps: BiometricLoginDeps,
  userId: string
): Promise<boolean> {
  const login = await biometricLoginEnabledFor(deps, userId);
  if (login && !isAppLockEnabled(deps.storage)) setAppLockEnabled(deps.storage, true);
  return login || isAppLockEnabled(deps.storage);
}
