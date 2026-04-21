"use client";

import { useEffect, useState } from "react";
import { Button } from "@web/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card";
import { Input } from "@web/components/ui/input";
import { useViewContextStore } from "@web/features/sharing/stores/view-context-store";
import type { ReceivedShare } from "@web/features/sharing/types";
import { Eye, LogOut } from "lucide-react";

/**
 * 내가 다른 사람에게서 공유받은 데이터 목록 + 코드 수락 입력.
 *
 * [이 계정으로 보기] 버튼은 view-context-store 를 통해 공유 모드로 진입하면서
 * /dashboard 로 리로드한다. [나가기] 는 내 수락을 스스로 해제.
 */
export function ReceivedSharesCard() {
  const [received, setReceived] = useState<ReceivedShare[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const enterShared = useViewContextStore((s) => s.enterShared);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const res = await fetch("/api/sharing/received", { credentials: "include" });
      if (!res.ok) {
        setLoadError(`불러오기 실패 (${res.status})`);
        return;
      }
      const body = (await res.json()) as { received: ReceivedShare[] };
      setReceived(body.received);
      setLoadError(null);
    } catch {
      setLoadError("네트워크 오류가 발생했습니다.");
    }
  }

  async function accept() {
    if (!codeInput.trim()) return;
    setAccepting(true);
    setAcceptError(null);
    try {
      const res = await fetch("/api/sharing/accept", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: codeInput.trim() }),
      });
      if (res.status === 404) {
        setAcceptError("유효하지 않은 코드입니다.");
        return;
      }
      if (res.status === 409) {
        setAcceptError("본인 소유 코드는 수락할 수 없습니다.");
        return;
      }
      if (!res.ok) {
        setAcceptError(`수락 실패 (${res.status})`);
        return;
      }
      setCodeInput("");
      await load();
    } catch {
      setAcceptError("네트워크 오류가 발생했습니다.");
    } finally {
      setAccepting(false);
    }
  }

  async function leave(id: string) {
    if (!confirm("이 공유에서 나가시겠습니까?")) return;
    const res = await fetch(`/api/sharing/received/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      setReceived((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
    } else {
      alert(`나가기 실패 (${res.status})`);
    }
  }

  function view(r: ReceivedShare) {
    enterShared({
      ownerId: r.owner.id,
      ownerName: r.owner.name,
      label: r.label,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>공유받은 데이터</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="공유 코드 입력"
              className="font-mono"
              disabled={accepting}
            />
            <Button onClick={accept} disabled={accepting || codeInput.trim().length === 0}>
              수락
            </Button>
          </div>
          {acceptError && <p className="text-sm text-red-600">{acceptError}</p>}
        </div>

        {loadError ? (
          <p className="text-sm text-red-600">{loadError}</p>
        ) : received === null ? (
          <p className="text-sm text-muted-foreground">불러오는 중...</p>
        ) : received.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            아직 수락한 공유가 없습니다. 위에 코드를 입력해 수락하세요.
          </p>
        ) : (
          <ul className="space-y-2">
            {received.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 border rounded-lg p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{r.owner.name}</p>
                  {r.label && <p className="text-xs text-muted-foreground truncate">{r.label}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" onClick={() => view(r)}>
                    <Eye className="w-4 h-4 mr-1" />이 계정으로 보기
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => leave(r.id)}
                    aria-label="나가기"
                  >
                    <LogOut className="w-4 h-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
