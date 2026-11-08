"use client";

import { VIEW_OVERRIDE_COOKIE, type DeviceKind } from "./device";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * UA 판별을 덮어쓰는 쿠키를 쓰거나 (`kind`) 지운다 (`null`). middleware 가
 * 다음 요청부터 반영하므로 호출 후 전체 리로드가 필요하다.
 */
export function setViewOverride(kind: DeviceKind | null): void {
  document.cookie =
    kind === null
      ? `${VIEW_OVERRIDE_COOKIE}=; path=/; max-age=0`
      : `${VIEW_OVERRIDE_COOKIE}=${kind}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}

export function getViewOverride(): DeviceKind | null {
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${VIEW_OVERRIDE_COOKIE}=`))
    ?.split("=")[1];
  return match === "mobile" || match === "desktop" ? match : null;
}
