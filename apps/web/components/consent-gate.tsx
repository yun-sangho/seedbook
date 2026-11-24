"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import { ConsentScreen } from "@web/components/consent-screen";
import { type ConsentStatus, fetchConsentStatus } from "@web/lib/consent-client";
import { ActionButton } from "@web/seed-design/ui/action-button";
import { Loader2 } from "lucide-react";

/**
 * 현재 약관에 동의하지 않았으면 앱 대신 동의 화면을 보여 준다. 동의를 확인하지 못해도 열지 않는다.
 * 서버도 동의 전에는 데이터 API 를 거절한다 (`lib/auth-server.ts`).
 */
export function ConsentGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConsentStatus | null>(null);

  const load = useCallback(async () => {
    setStatus(null);
    setStatus(await fetchConsentStatus());
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (status?.kind === "agreed") return <>{children}</>;
  if (status?.kind === "required") return <ConsentScreen newSignUp={status.newSignUp} />;
  if (status?.kind === "failed") {
    return (
      <main className="bg-bg-layer-default text-fg-neutral flex h-dvh w-full flex-col items-center justify-center gap-x4 p-x6 text-center">
        <p className="t5-regular break-keep">
          서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.
        </p>
        <ActionButton variant="neutralSolid" size="large" onClick={load}>
          다시 시도
        </ActionButton>
      </main>
    );
  }
  return (
    <div
      role="status"
      aria-live="polite"
      className="w-screen h-screen flex items-center justify-center"
    >
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      <span className="sr-only">약관 동의를 확인하는 중...</span>
    </div>
  );
}
