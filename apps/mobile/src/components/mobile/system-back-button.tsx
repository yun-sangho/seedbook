"use client";

import { useEffect } from "react";
import { systemBack } from "@mobile/lib/native/system-back";

/** Android 앱의 시스템 뒤로가기를 받는다. 로그인 화면에서도 동작하도록 게이트 밖에 둔다. */
export function SystemBackButton() {
  useEffect(() => systemBack.start(), []);
  return null;
}
