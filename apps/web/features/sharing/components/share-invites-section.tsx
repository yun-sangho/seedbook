"use client";

import { useEffect, useState } from "react";
import { Button } from "@web/components/ui/button";
import type { ShareInvite } from "@web/features/sharing/types";
import { Copy, Link2, Trash2 } from "lucide-react";

/**
 * 한 공유에 속한 1회용 초대 링크 목록 + 새 링크 발급 + 취소 UI.
 * MySharesCard 가 share 별로 한 인스턴스씩 렌더한다.
 */

function inviteUrl(token: string): string {
  if (typeof window === "undefined") return `/invite/${token}`;
  return `${window.location.origin}/invite/${token}`;
}

function formatExpiry(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "만료됨";
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return `${days}일 남음`;
  const hours = Math.ceil(ms / (60 * 60 * 1000));
  return `${hours}시간 남음`;
}

export function ShareInvitesSection({ shareId }: { shareId: string }) {
  const [invites, setInvites] = useState<ShareInvite[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareId]);

  async function load() {
    try {
      const res = await fetch(`/api/sharing/shares/${shareId}/invites`, {
        credentials: "include",
      });
      if (!res.ok) {
        setLoadError(`불러오기 실패 (${res.status})`);
        return;
      }
      const body = (await res.json()) as { invites: ShareInvite[] };
      setInvites(body.invites);
      setLoadError(null);
    } catch {
      setLoadError("네트워크 오류가 발생했습니다.");
    }
  }

  async function create() {
    setCreating(true);
    try {
      const res = await fetch(`/api/sharing/shares/${shareId}/invites`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        alert(`초대 링크 생성 실패 (${res.status})`);
        return;
      }
      const body = (await res.json()) as { invite: ShareInvite };
      setInvites((prev) => (prev ? [body.invite, ...prev] : [body.invite]));
      try {
        await navigator.clipboard.writeText(inviteUrl(body.invite.token));
      } catch {
        // 권한 거부는 무시 — 사용자는 목록에서 직접 복사 가능.
      }
    } finally {
      setCreating(false);
    }
  }

  async function remove(inviteId: string) {
    if (!confirm("이 초대 링크를 취소하시겠습니까?")) return;
    const res = await fetch(`/api/sharing/shares/${shareId}/invites/${inviteId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      setInvites((prev) => (prev ? prev.filter((i) => i.id !== inviteId) : prev));
    } else {
      alert(`취소 실패 (${res.status})`);
    }
  }

  async function copyLink(token: string) {
    try {
      await navigator.clipboard.writeText(inviteUrl(token));
    } catch {
      // 권한 거부는 무시
    }
  }

  return (
    <div className="border-t pt-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">1회용 초대 링크</p>
        <Button size="sm" variant="outline" onClick={create} disabled={creating}>
          <Link2 className="w-3.5 h-3.5 mr-1" />
          {creating ? "생성 중…" : "링크 만들기"}
        </Button>
      </div>
      {loadError ? (
        <p className="text-xs text-red-600">{loadError}</p>
      ) : invites === null ? (
        <p className="text-xs text-muted-foreground">불러오는 중…</p>
      ) : invites.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          링크 만들기를 누르면 1회 사용 가능한 초대 URL 이 생성되고 자동으로 복사됩니다.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {invites.map((inv) => {
            const used = inv.consumedAt !== null;
            const expired = !used && new Date(inv.expiresAt).getTime() < Date.now();
            return (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-2 text-xs bg-muted/40 rounded px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <code className="font-mono truncate">{inviteUrl(inv.token)}</code>
                    {!used && !expired && (
                      <button
                        type="button"
                        onClick={() => copyLink(inv.token)}
                        className="text-muted-foreground hover:text-foreground shrink-0"
                        aria-label="링크 복사"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {used ? "사용됨" : expired ? "만료됨" : formatExpiry(inv.expiresAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(inv.id)}
                  className="text-muted-foreground hover:text-red-600 shrink-0"
                  aria-label="삭제"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
