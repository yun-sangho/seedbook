"use client";

import { useEffect, useState } from "react";
import type { SeedPluginOptions } from "@seed-design/stackflow";
import { startNextRouterSync } from "./next-aware-history";
import { Stack } from "./stackflow";

function detectTheme(): SeedPluginOptions["theme"] {
  return /android/i.test(navigator.userAgent) ? "android" : "cupertino";
}

export default function MobileStackClient() {
  const [theme] = useState(detectTheme);
  // 첫 커밋 뒤부터는 history 기록을 Next 라우터에 그대로 알린다 (next-aware-history.ts).
  useEffect(startNextRouterSync, []);
  return (
    <div
      className="text-fg-neutral fixed inset-0 overflow-hidden"
      style={{ fontFamily: "var(--seed-font-family)" }}
    >
      <Stack initialContext={{ theme } satisfies SeedPluginOptions} />
    </div>
  );
}
