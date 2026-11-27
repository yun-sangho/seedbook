import { needsSeparateStorageNotice } from "@web/lib/pwa-install";
import type { StorageMode } from "@web/lib/storage-mode";

/**
 * 이 기기에만 저장할 때, 같은 기기의 다른 실행 환경과 데이터가 따로라는 안내 (설정 메뉴의 저장 위치
 * 행·저장 위치 화면). 필요 없으면 null.
 */
export function separateStorageNotice(input: {
  isIOS: boolean;
  isNativeApp: boolean;
  storageMode: StorageMode;
}): string | null {
  if (!needsSeparateStorageNotice(input)) return null;
  return input.isNativeApp
    ? "앱과 브라우저는 데이터가 따로 저장돼요"
    : "Safari와 홈 화면 앱은 데이터가 따로 저장돼요";
}
