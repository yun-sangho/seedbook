import { describe, expect, it, vi } from "vitest";

/**
 * Capacitor 플러그인 객체는 모든 속성을 네이티브 메서드로 바꾸는 Proxy 다. `.then` 도 예외가 아니라
 * 플러그인을 Promise 결과로 돌려주면 `await` 가 `plugin.then()` 을 불러 "not implemented" 로 거절된다.
 */
function capacitorPluginProxy(methods: Record<string, (...args: unknown[]) => unknown>) {
  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (typeof prop === "string" && prop in methods) return methods[prop];
        return () =>
          Promise.reject(new Error(`"NativeBiometric.${String(prop)}()" is not implemented`));
      },
    }
  );
}

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));

const verifyIdentity = vi.fn(async () => undefined);
vi.mock("@capgo/capacitor-native-biometric", () => ({
  BiometryType: { FACE_ID: 2, TOUCH_ID: 1, FINGERPRINT: 3 },
  NativeBiometric: capacitorPluginProxy({
    isAvailable: async () => ({ isAvailable: true, biometryType: 2 }),
    verifyIdentity,
  }),
}));

describe("native biometric wrapper", () => {
  it("reports Face ID when the device supports it", async () => {
    const { availableBiometryLabel } = await import("./biometric");

    expect(await availableBiometryLabel()).toBe("Face ID");
  });

  it("passes when the user verifies their identity", async () => {
    const { verifyBiometric } = await import("./biometric");

    expect(await verifyBiometric("잠금 해제")).toBe(true);
    expect(verifyIdentity).toHaveBeenCalledTimes(1);
  });
});
