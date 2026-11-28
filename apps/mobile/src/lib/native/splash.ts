import { useEffect } from "react";
import { isBundledApp } from "./bundled-app";

/**
 * 네이티브 스플래시 (`@capacitor/splash-screen`). 바이너리는 첫 화면이 그려질 때까지 스플래시를 띄워 두고
 * (`capacitor.config.ts` `SplashScreen`), 앱이 첫 화면(로그인·가입·홈)을 그리면 여기서 닫는다 — 스플래시와
 * 첫 화면 사이에 빈 화면·스피너가 끼지 않게.
 *
 * 앱이 닫지 못해도(이 코드를 모르는 옛 OTA 번들, 오류) 바이너리가 `launchShowDuration` 뒤에 스스로 닫는다.
 * 플러그인이 없는 옛 바이너리·웹에서는 아무것도 하지 않는다.
 */
export const SPLASH_PLUGIN = "SplashScreen";
export const SPLASH_FADE_OUT_MS = 200;

interface SplashHiderDeps {
  available: () => boolean;
  hide: (options: { fadeOutDuration: number }) => Promise<void>;
}

export function createSplashHider({ available, hide }: SplashHiderDeps): () => Promise<void> {
  let hidden: Promise<void> | null = null;
  return () => {
    if (!available()) return Promise.resolve();
    hidden ??= hide({ fadeOutDuration: SPLASH_FADE_OUT_MS }).catch((error) => {
      console.warn("[splash] 스플래시를 닫지 못했다 (시간이 지나면 스스로 닫힌다)", error);
    });
    return hidden;
  };
}

interface CapacitorGlobal {
  isPluginAvailable?: (name: string) => boolean;
}

function splashAvailable(): boolean {
  if (!isBundledApp()) return false;
  const capacitor = (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor;
  return capacitor?.isPluginAvailable?.(SPLASH_PLUGIN) === true;
}

/** 첫 화면을 그렸다 — 네이티브 스플래시를 닫는다. 여러 번 불러도 한 번만 닫는다. */
export const hideSplash = createSplashHider({
  available: splashAvailable,
  hide: async (options) => {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide(options);
  },
});

/** 이 화면이 그려지면 네이티브 스플래시를 닫는다 (앱이 처음 보여 주는 화면들에서 쓴다). */
export function useHideSplash(): void {
  useEffect(() => {
    void hideSplash();
  }, []);
}
