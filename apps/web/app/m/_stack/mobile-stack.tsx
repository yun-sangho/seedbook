"use client";

import dynamic from "next/dynamic";

/**
 * Stackflow 는 `window.history` 를 초기 상태로 읽으므로 클라이언트에서만 렌더한다.
 */
export const MobileStack = dynamic(() => import("./mobile-stack-client"), { ssr: false });
