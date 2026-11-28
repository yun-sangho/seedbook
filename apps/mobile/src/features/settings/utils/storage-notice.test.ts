import { describe, expect, it } from "vitest";
import { separateStorageNotice } from "./storage-notice";

describe("separateStorageNotice", () => {
  it("tells native app users that the browser keeps separate data", () => {
    expect(separateStorageNotice({ isIOS: false, isNativeApp: true, storageMode: "local" })).toBe(
      "앱과 브라우저는 데이터가 따로 저장돼요"
    );
  });

  it("tells iOS browser users that Safari and the home screen app keep separate data", () => {
    expect(separateStorageNotice({ isIOS: true, isNativeApp: false, storageMode: "local" })).toBe(
      "Safari와 홈 화면 앱은 데이터가 따로 저장돼요"
    );
  });

  it("says nothing in cloud mode", () => {
    expect(
      separateStorageNotice({ isIOS: true, isNativeApp: true, storageMode: "cloud" })
    ).toBeNull();
  });

  it("says nothing for Android browsers", () => {
    expect(
      separateStorageNotice({ isIOS: false, isNativeApp: false, storageMode: "local" })
    ).toBeNull();
  });
});
