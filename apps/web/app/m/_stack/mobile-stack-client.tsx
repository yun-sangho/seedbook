"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import type { SeedPluginOptions } from "@seed-design/stackflow";
import { useSession } from "@web/lib/auth-client";
import { systemBack } from "@web/lib/native/system-back";
import { startNextRouterSync } from "./next-aware-history";
import { bindStackToAccount, goBack, isStackOfOtherAccount } from "./stack-control";
import { Stack } from "./stackflow";

function detectTheme(): SeedPluginOptions["theme"] {
  return /android/i.test(navigator.userAgent) ? "android" : "cupertino";
}

export default function MobileStackClient() {
  const [theme] = useState(detectTheme);
  // 첫 커밋 뒤부터는 history 기록을 Next 라우터에 그대로 알린다 (next-aware-history.ts).
  useEffect(startNextRouterSync, []);
  // Android 시스템 뒤로가기 (lib/native/system-back.ts).
  useEffect(() => systemBack.setScreenBack(goBack), []);
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
      {ready && <Stack initialContext={{ theme } satisfies SeedPluginOptions} />}
    </div>
  );
}
