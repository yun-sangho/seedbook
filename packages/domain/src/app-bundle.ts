import { compareAppVersions, parseAppVersion } from "./app-version";

/**
 * OTA 앱 번들 (무심사 화면 업데이트). 네이티브 앱은 시작·복귀 때 서버(`GET /api/app-bundle/latest`)에
 * 받을 번들을 묻고, 받으면 다음 실행 때 그 번들로 뜬다 (`apps/mobile/src/lib/native/live-update.ts`,
 * 플러그인 `@capawesome/capacitor-live-update`). 서버는 `apps/web/server/app-bundles/`.
 *
 * - **채널**: `beta` 는 올린 번들을 바로 받는다 (Dev 앱·내부 테스터). `production` 은 운영자가 승격한
 *   번들만, 승격 때 정한 비율의 기기만 받는다 (단계 배포).
 * - **네이티브 호환**: 번들은 만든 코드의 앱 버전(`appVersion`)과 돌 수 있는 가장 낮은 바이너리
 *   (`minNative`) 를 갖는다. `minNative ≤ 바이너리 ≤ appVersion` 인 앱에만 준다 — 네이티브 플러그인이
 *   없는 옛 바이너리에도, 더 새 화면을 담은 새 바이너리에도 보내지 않는다.
 * - **중단**: 운영자가 내리거나, 기기가 보고한 실패(롤백·검증 실패)가 기준을 넘으면 서버가 스스로 내린다
 *   ({@link shouldHaltBundle}). 내린 번들을 쓰는 기기는 다음 확인 때 다른 번들이나 내장 번들로 돌아간다.
 */

export const APP_BUNDLE_CHANNELS = ["beta", "production"] as const;
export type AppBundleChannel = (typeof APP_BUNDLE_CHANNELS)[number];

export function isAppBundleChannel(value: unknown): value is AppBundleChannel {
  return (APP_BUNDLE_CHANNELS as readonly unknown[]).includes(value);
}

/**
 * 번들 id: 소문자·숫자·`.`·`-` 만, 64자까지 (플러그인이 기기에 폴더 이름으로 쓴다. `public` 은 플러그인이
 * 예약했다). 워크플로는 `<커밋 sha 12자>-<run 번호>` 로 짓는다 (`scripts/app-bundle-lib.mjs`).
 */
const BUNDLE_ID_PATTERN = /^[a-z0-9][a-z0-9.-]{0,63}$/;

export function isAppBundleId(value: unknown): value is string {
  return typeof value === "string" && BUNDLE_ID_PATTERN.test(value) && value !== "public";
}

/** 기기가 받을 번들. `url` 은 API 서버 기준 경로다 (앱이 API 주소를 붙인다). */
export interface AppBundleOffer {
  id: string;
  /** 이 번들을 만든 코드의 앱 버전 (`apps/mobile/package.json` `version`). */
  appVersion: string;
  /** 번들을 만든 커밋 sha. 앱은 자기 빌드와 같으면 받지 않는다. */
  build: string;
  url: string;
  /** zip 의 SHA-256 (hex). */
  checksum: string;
  /** zip SHA-256 에 대한 RSA(PKCS#1 v1.5) 서명 (base64). 앱에 내장한 공개 키로 확인한다. */
  signature: string;
}

/**
 * `GET /api/app-bundle/latest` 응답.
 * - `bundle`: 받을 번들. 없으면 null (번들이 없거나 이 기기 차례가 아님) — 앱은 아무것도 하지 않는다.
 * - `reset`: 기기가 지금 쓰는 번들(`current`)이 내려졌고 대신 받을 번들도 없다 — 다음 실행 때 내장 번들로.
 */
export interface LatestAppBundleResponse {
  bundle: AppBundleOffer | null;
  reset: boolean;
}

export const NO_APP_BUNDLE: LatestAppBundleResponse = { bundle: null, reset: false };

const HEX_SHA256 = /^[0-9a-f]{64}$/;

function parseOffer(value: unknown): AppBundleOffer | null {
  if (typeof value !== "object" || value === null) return null;
  const { id, appVersion, build, url, checksum, signature } = value as Record<string, unknown>;
  if (!isAppBundleId(id)) return null;
  if (typeof appVersion !== "string" || !parseAppVersion(appVersion)) return null;
  if (typeof build !== "string" || build.length === 0) return null;
  if (typeof url !== "string" || !url.startsWith("/api/app-bundle/files/")) return null;
  if (typeof checksum !== "string" || !HEX_SHA256.test(checksum)) return null;
  if (typeof signature !== "string" || signature.length === 0) return null;
  return { id, appVersion, build, url, checksum, signature };
}

/** 응답을 읽는다. 모양이 틀리면 "받을 것 없음" — 이상한 응답으로 번들을 바꾸지 않는다. */
export function parseLatestAppBundleResponse(body: unknown): LatestAppBundleResponse {
  if (typeof body !== "object" || body === null) return NO_APP_BUNDLE;
  const { bundle, reset } = body as Record<string, unknown>;
  const offer = bundle === null || bundle === undefined ? null : parseOffer(bundle);
  if (bundle !== null && bundle !== undefined && offer === null) return NO_APP_BUNDLE;
  return { bundle: offer, reset: offer === null && reset === true };
}

/** 이 바이너리(`native`) 가 번들을 돌릴 수 있는지: `minNative ≤ native ≤ appVersion`. */
export function bundleFitsNative(
  bundle: { appVersion: string; minNative: string },
  native: string
): boolean {
  const aboveMin = compareAppVersions(native, bundle.minNative);
  const belowApp = compareAppVersions(native, bundle.appVersion);
  return aboveMin !== null && belowApp !== null && aboveMin >= 0 && belowApp <= 0;
}

/**
 * 단계 배포에서 기기의 자리 (0~99). 같은 기기·번들은 늘 같은 자리라, 비율을 올려도 이미 받은 기기는
 * 계속 받는다. 번들마다 섞여 같은 기기가 매번 먼저 받지 않는다 (FNV-1a).
 */
export function rolloutBucket(bundleId: string, device: string): number {
  let hash = 0x811c9dc5;
  for (const char of `${bundleId}:${device}`) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 100;
}

/** production 승격 비율 안인지. 기기 id 를 모르면 100% 일 때만. */
export function inRollout(
  bundleId: string,
  device: string | null,
  rolloutPercent: number
): boolean {
  if (rolloutPercent >= 100) return true;
  if (!device) return false;
  return rolloutBucket(bundleId, device) < rolloutPercent;
}

/** 기기가 보고하는 적용 결과. */
export const APP_BUNDLE_OUTCOMES = [
  /** 새 번들로 떠서 `ready()` 까지 갔다. */
  "applied",
  /** 새 번들이 제한 시간 안에 뜨지 못해 플러그인이 내장 번들로 되돌렸다. */
  "rolled_back",
  /** 받은 zip 의 체크섬·서명이 맞지 않았다. */
  "verify_failed",
  /** 내려받기·풀기 실패 (네트워크 등). 자동 중단 기준에는 넣지 않는다. */
  "download_failed",
] as const;
export type AppBundleOutcome = (typeof APP_BUNDLE_OUTCOMES)[number];

export function isAppBundleOutcome(value: unknown): value is AppBundleOutcome {
  return (APP_BUNDLE_OUTCOMES as readonly unknown[]).includes(value);
}

/** 번들 하나의 기기별 결과 수 (한 기기는 결과마다 한 번만 센다). */
export type AppBundleReportCounts = Record<AppBundleOutcome, number>;

/** 자동 중단: 실패한 기기가 이만큼 이상이고 … */
export const HALT_MIN_FAILURES = 3;
/** … 결과를 보고한 기기 중 실패 비율이 이만큼 이상이면 번들을 내린다. */
export const HALT_FAILURE_RATIO = 0.2;

/**
 * 번들을 자동으로 내릴지. 실패 = 롤백 + 검증 실패 (내려받기 실패는 네트워크 탓일 수 있어 뺀다).
 * 기기 몇 대의 우연한 실패로 내리지 않게 최소 건수를 둔다.
 */
export function shouldHaltBundle(counts: AppBundleReportCounts): boolean {
  const failures = counts.rolled_back + counts.verify_failed;
  const total = failures + counts.applied;
  return failures >= HALT_MIN_FAILURES && failures / total >= HALT_FAILURE_RATIO;
}
