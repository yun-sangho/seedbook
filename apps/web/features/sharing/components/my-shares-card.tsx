"use client";

import { useEffect, useState } from "react";
import { Button } from "@web/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card";
import type { OwnedShare } from "@web/features/sharing/types";
import { Copy, Plus, Trash2, UserX } from "lucide-react";
import { CreateShareDialog } from "./create-share-dialog";

/**
 * 내가 만든 공유 코드 목록 + 수락자 관리 카드.
 *
 * 클라우드 모드에서만 렌더됨 (부모가 분기). 공유 생성 / 해제 / 개별 수락자
 * 제거가 가능하다.
 */
export function MySharesCard() {
  const [shares, setShares] = useState<OwnedShare[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    void loadShares();
  }, []);

  async function loadShares() {
    try {
      const res = await fetch("/api/sharing/shares", { credentials: "include" });
      if (!res.ok) {
        setLoadError(`불러오기 실패 (${res.status})`);
        return;
      }
      const body = (await res.json()) as { shares: OwnedShare[] };
      setShares(body.shares);
      setLoadError(null);
    } catch {
      setLoadError("네트워크 오류가 발생했습니다.");
    }
  }

  async function removeShare(id: string) {
    if (!confirm("이 공유를 해제하시겠습니까? 수락한 모든 사람의 접근이 차단됩니다.")) return;
    const res = await fetch(`/api/sharing/shares/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      setShares((prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
    } else {
      alert(`삭제 실패 (${res.status})`);
    }
  }

  async function kickAcceptance(shareId: string, acceptanceId: string) {
    if (!confirm("이 수락자의 접근을 차단하시겠습니까?")) return;
    const res = await fetch(`/api/sharing/shares/${shareId}/acceptances/${acceptanceId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      setShares((prev) =>
        prev
          ? prev.map((s) =>
              s.id === shareId
                ? { ...s, acceptances: s.acceptances.filter((a) => a.id !== acceptanceId) }
                : s
            )
          : prev
      );
    } else {
      alert(`차단 실패 (${res.status})`);
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // 권한 거부는 무시
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>내가 공유한 데이터</CardTitle>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />
          공유 코드 만들기
        </Button>
      </CardHeader>
      <CardContent>
        {loadError ? (
          <p className="text-sm text-red-600">{loadError}</p>
        ) : shares === null ? (
          <p className="text-sm text-muted-foreground">불러오는 중...</p>
        ) : shares.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            아직 만든 공유 코드가 없습니다. 위 버튼으로 코드를 만들어 상대방에게 전달하세요.
          </p>
        ) : (
          <ul className="space-y-3">
            {shares.map((share) => (
              <li key={share.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{share.label || "(라벨 없음)"}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">
                        {share.code}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyCode(share.code)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="코드 복사"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeShare(share.id)}
                    aria-label="공유 해제"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                {share.acceptances.length > 0 && (
                  <ul className="border-t pt-2 space-y-1.5">
                    {share.acceptances.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">{a.recipient.name}</span>
                        <button
                          type="button"
                          onClick={() => kickAcceptance(share.id, a.id)}
                          className="text-muted-foreground hover:text-red-600 shrink-0"
                          aria-label="접근 차단"
                        >
                          <UserX className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <CreateShareDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(share) => setShares((prev) => (prev ? [share, ...prev] : [share]))}
      />
    </Card>
  );
}
