"use client";

import { useState } from "react";
import { Button } from "@web/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@web/components/ui/dialog";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import type { OwnedShare } from "@web/features/sharing/types";
import { Check, Copy, Loader2 } from "lucide-react";

type DialogStep =
  | { kind: "input" }
  | { kind: "submitting" }
  | { kind: "result"; share: OwnedShare }
  | { kind: "error"; message: string };

/**
 * 새 공유 코드를 생성하는 다이얼로그. 라벨을 선택적으로 받고, 생성 후 코드를
 * 복사 가능한 형태로 보여준다.
 */
export function CreateShareDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (share: OwnedShare) => void;
}) {
  const [step, setStep] = useState<DialogStep>({ kind: "input" });
  const [label, setLabel] = useState("");
  const [copied, setCopied] = useState(false);

  async function submit() {
    setStep({ kind: "submitting" });
    try {
      const res = await fetch("/api/sharing/shares", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: label.trim() }),
      });
      if (!res.ok) {
        setStep({ kind: "error", message: `생성 실패 (${res.status})` });
        return;
      }
      const body = (await res.json()) as { share: OwnedShare };
      onCreated(body.share);
      setStep({ kind: "result", share: body.share });
    } catch {
      setStep({ kind: "error", message: "네트워크 오류가 발생했습니다." });
    }
  }

  function close() {
    onOpenChange(false);
    // 다음 open 에 초기 상태를 보이도록 리셋.
    setTimeout(() => {
      setStep({ kind: "input" });
      setLabel("");
      setCopied(false);
    }, 200);
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 접근 실패 — 사용자가 직접 선택 복사 가능하도록 input 으로 노출.
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? close() : undefined)}>
      <DialogContent>
        {step.kind === "input" && (
          <>
            <DialogHeader>
              <DialogTitle>공유 코드 만들기</DialogTitle>
              <DialogDescription>
                상대방에게 이 코드를 전달하면 내 데이터를 읽기 전용으로 볼 수 있습니다. 라벨은
                소유자만 보이는 메모입니다.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="share-label">라벨 (선택)</Label>
              <Input
                id="share-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="예: 아내, 부모님"
                maxLength={50}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={close}>
                취소
              </Button>
              <Button onClick={submit}>만들기</Button>
            </DialogFooter>
          </>
        )}

        {step.kind === "submitting" && (
          <>
            <DialogHeader>
              <DialogTitle>공유 코드 생성 중...</DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          </>
        )}

        {step.kind === "result" && (
          <>
            <DialogHeader>
              <DialogTitle>공유 코드가 생성되었습니다</DialogTitle>
              <DialogDescription>
                이 코드를 상대방에게 전달하세요. 상대가 코드를 입력하면 수락자 목록에 표시됩니다.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 py-2">
              <Input readOnly value={step.share.code} className="font-mono" />
              <Button
                variant="outline"
                onClick={() => copyCode(step.share.code)}
                className="shrink-0"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={close}>닫기</Button>
            </DialogFooter>
          </>
        )}

        {step.kind === "error" && (
          <>
            <DialogHeader>
              <DialogTitle>생성 실패</DialogTitle>
              <DialogDescription>{step.message}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={close}>
                닫기
              </Button>
              <Button onClick={submit}>재시도</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
