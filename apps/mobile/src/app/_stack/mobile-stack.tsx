import { lazy } from "react";

/**
 * 화면 스택. 스택(stackflow·SEED 화면)은 로그인·동의 게이트를 지난 뒤에만 그리므로 따로 받아 온다 —
 * 로그인 화면의 첫 JS 에 들어가지 않는다. `<Suspense>` 안에서 그린다.
 */
export const MobileStack = lazy(() => import("./mobile-stack-client"));
