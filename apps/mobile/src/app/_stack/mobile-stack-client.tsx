import { useEffect, useLayoutEffect, useState } from "react";
import { PwaInstallContext, usePwaInstall } from "@mobile/hooks/use-pwa-install";
import { useSession } from "@mobile/lib/auth-client";
import { systemBack } from "@mobile/lib/native/system-back";
import type { SeedPluginOptions } from "@seed-design/stackflow";
import { bindStackToAccount, goBack, isStackOfOtherAccount } from "./stack-control";
import { Stack } from "./stackflow";

function detectTheme(): SeedPluginOptions["theme"] {
  return /android/i.test(navigator.userAgent) ? "android" : "cupertino";
}

export default function MobileStackClient() {
  const [theme] = useState(detectTheme);
  // Android 시스템 뒤로가기 (lib/native/system-back.ts).
  useEffect(() => systemBack.setScreenBack(goBack), []);
  // `beforeinstallprompt` 는 로드 직후 한 번 오므로 셸에서 받아 설정 메뉴에 내려준다.
  const pwaInstall = usePwaInstall();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;
  // 새로고침 없이 다른 계정으로 바뀌었으면 스택을 되돌린 뒤에 그린다.
  const [ready, setReady] = useState(() => !isStackOfOtherAccount(userId));
  useLayoutEffect(() => {
    bindStackToAccount(userId);
    setReady(true);
  }, [userId]);
  return (
    <div
      className="text-fg-neutral fixed inset-0 overflow-hidden"
      style={{ fontFamily: "var(--seed-font-family)" }}
    >
      <PwaInstallContext.Provider value={pwaInstall}>
        {ready && <Stack initialContext={{ theme } satisfies SeedPluginOptions} />}
      </PwaInstallContext.Provider>
    </div>
  );
}
