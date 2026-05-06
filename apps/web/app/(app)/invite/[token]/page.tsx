"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@web/components/ui/button";
import { useViewContextStore } from "@web/features/sharing/stores/view-context-store";
import { Loader2 } from "lucide-react";

/**
 * 초대 링크 랜딩 페이지.
 *
 * 흐름:
 *   1. 토큰 메타데이터 fetch (만료/취소/소비 여부 확인).
 *   2. AuthGate 가 미인증 사용자를 카카오 로그인 화면으로 보내므로 여기까지
 *      도달했다는 건 "이미 로그인된 상태". 자동으로 accept API 호출.
 *   3. 성공 시 view-context-store 가 /assets 로 리다이렉트하면서 공유 모드 진입.
 *
 * 모든 응답은 idempotent — 같은 사용자가 다시 들어와도 안전하다.
 */

type InviteMeta = {
  id: string;
  label: string | null;
  expiresAt: string;
  consumedAt: string | null;
  expired: boolean;
  consumed: boolean;
  shareId: string;
  owner: { id: string; name: string; image: string | null };
};

type AcceptOk = {
  acceptance: {
    id: string;
    shareId: string;
    acceptedAt: string;
    label: string | null;
    owner: { id: string; name: string; image: string | null };
  };
};

type Phase =
  | { kind: "loading" }
  | { kind: "ready"; meta: InviteMeta }
  | { kind: "accepting"; meta: InviteMeta }
  | { kind: "error"; title: string; detail?: string };

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const addAggregateOwner = useViewContextStore((s) => s.addAggregateOwner);
  const acceptedOnce = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function loadMeta() {
      try {
        const res = await fetch(`/api/sharing/invites/${encodeURIComponent(token)}`, {
          credentials: "include",
        });
        if (cancelled) return;
        if (res.status === 404) {
          setPhase({ kind: "error", title: "유효하지 않은 초대 링크예요." });
          return;
        }
        if (res.status === 410) {
          setPhase({ kind: "error", title: "공유가 취소되었어요." });
          return;
        }
        if (!res.ok) {
          setPhase({ kind: "error", title: `초대 정보를 불러오지 못했어요 (${res.status})` });
          return;
        }
        const body = (await res.json()) as { invite: InviteMeta };
        const meta = body.invite;
        if (meta.expired) {
          setPhase({ kind: "error", title: "초대 링크가 만료됐어요." });
          return;
        }
        setPhase({ kind: "ready", meta });
      } catch {
        if (!cancelled) {
          setPhase({ kind: "error", title: "네트워크 오류가 발생했어요." });
        }
      }
    }
    void loadMeta();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const accept = useCallback(
    async (meta: InviteMeta) => {
      setPhase({ kind: "accepting", meta });
      try {
        const res = await fetch(`/api/sharing/invites/${encodeURIComponent(token)}/accept`, {
          method: "POST",
          credentials: "include",
        });
        if (res.status === 409) {
          setPhase({
            kind: "error",
            title: "본인 소유의 공유는 수락할 수 없어요.",
            detail: "다른 계정으로 로그인한 뒤 다시 시도해 주세요.",
          });
          return;
        }
        if (res.status === 410) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          const reason = body?.error;
          setPhase({
            kind: "error",
            title:
              reason === "expired"
                ? "초대 링크가 만료됐어요."
                : reason === "already consumed"
                  ? "이 초대는 이미 다른 분이 사용했어요."
                  : "공유가 취소되었어요.",
          });
          return;
        }
        if (!res.ok) {
          setPhase({ kind: "error", title: `수락에 실패했어요 (${res.status})` });
          return;
        }
        const body = (await res.json()) as AcceptOk;
        // 수락한 owner 를 aggregate 모드의 활성 목록에 자동 추가하고 /assets 로 이동.
        addAggregateOwner({
          ownerId: body.acceptance.owner.id,
          ownerName: body.acceptance.owner.name,
          label: body.acceptance.label,
        });
        if (typeof window !== "undefined") window.location.href = "/assets";
      } catch {
        setPhase({ kind: "error", title: "네트워크 오류가 발생했어요." });
      }
    },
    [token, addAggregateOwner],
  );

  useEffect(() => {
    if (phase.kind !== "ready" || acceptedOnce.current) return;
    acceptedOnce.current = true;
    void accept(phase.meta);
  }, [phase, accept]);

  return (
    <div className="w-full min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full flex flex-col items-center text-center gap-4">
        {phase.kind === "loading" && (
          <>
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">초대 정보를 확인하는 중…</p>
          </>
        )}
        {(phase.kind === "ready" || phase.kind === "accepting") && (
          <>
            <div className="space-y-1">
              <h1 className="text-lg font-semibold">{phase.meta.owner.name}님의 초대</h1>
              {phase.meta.label && (
                <p className="text-sm text-muted-foreground">{phase.meta.label}</p>
              )}
              <p className="text-sm text-muted-foreground">
                자산 데이터를 함께 보기 위한 초대입니다.
              </p>
            </div>
            {phase.kind === "accepting" ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                수락 중…
              </div>
            ) : (
              <Button onClick={() => accept(phase.meta)}>수락하기</Button>
            )}
          </>
        )}
        {phase.kind === "error" && (
          <>
            <div className="space-y-1">
              <h1 className="text-lg font-semibold">{phase.title}</h1>
              {phase.detail && <p className="text-sm text-muted-foreground">{phase.detail}</p>}
            </div>
            <Button variant="outline" onClick={() => (window.location.href = "/assets")}>
              내 자산으로 돌아가기
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
