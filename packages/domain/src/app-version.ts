/**
 * 네이티브 앱 버전 (앱 번들 = 바이너리, `apps/mobile/package.json` `version`). 서버의 `/api/app-config`
 * 가 지원하는 가장 낮은 버전을 알리고, 앱은 그보다 낮으면 업데이트 화면으로 막는다
 * (`apps/mobile/src/components/update-gate.tsx`). 동기화 스키마 버전(`version.ts` `MIN_SCHEMA`)과는 별개다 —
 * 이것은 API·화면이 옛 앱을 더 받아 줄 수 없을 때 쓰는 마지막 수단이다.
 */

/** `major.minor.patch` (숫자만). */
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export interface AppConfig {
  /** 이보다 낮은 앱은 쓸 수 없다 — 업데이트 화면을 띄운다. */
  minSupportedVersion: string;
  /** 스토어에 나온 가장 새 버전. */
  latestVersion: string;
}

/** 버전 문자열을 숫자 셋으로. 모양이 틀리면 null. */
export function parseAppVersion(version: string): [number, number, number] | null {
  const match = VERSION_PATTERN.exec(version);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** a 가 b 보다 낮으면 음수, 같으면 0, 높으면 양수. 모양이 틀린 버전은 null. */
export function compareAppVersions(a: string, b: string): number | null {
  const left = parseAppVersion(a);
  const right = parseAppVersion(b);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i++) {
    const diff = (left[i] as number) - (right[i] as number);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** `/api/app-config` 응답을 읽는다. 모양이 틀리면 null (앱을 막지 않는다). */
export function parseAppConfig(body: unknown): AppConfig | null {
  if (typeof body !== "object" || body === null) return null;
  const { minSupportedVersion, latestVersion } = body as Record<string, unknown>;
  if (typeof minSupportedVersion !== "string" || !parseAppVersion(minSupportedVersion)) return null;
  if (typeof latestVersion !== "string" || !parseAppVersion(latestVersion)) return null;
  return { minSupportedVersion, latestVersion };
}

/**
 * 이 앱 버전을 막아야 하는지. 앱 버전이나 설정을 모르면 막지 않는다 — 오프라인·서버 오류·모양이 틀린
 * 응답으로 앱을 잠그지 않는다.
 */
export function isAppVersionBlocked(appVersion: string, config: AppConfig | null): boolean {
  if (!config) return false;
  const diff = compareAppVersions(appVersion, config.minSupportedVersion);
  return diff !== null && diff < 0;
}
