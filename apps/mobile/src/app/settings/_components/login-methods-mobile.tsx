"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppleSignInEnabled } from "@mobile/components/apple-sign-in-button";
import { authClient } from "@mobile/lib/auth-client";
import { getDeviceStorage } from "@mobile/lib/device-storage";
import { forgetLastLoginMethod, type SocialProvider } from "@mobile/lib/last-login-method";
import {
  type LinkedAccount,
  type LinkResultParams,
  LOGIN_METHODS_PATH,
  type LoginMethodRow,
  linkCallbackURLs,
  linkResultFrom,
  linkResultMessage,
  loginMethodRows,
  unlinkErrorMessage,
} from "@mobile/lib/login-methods";
import {
  canSignInWith,
  hasNativeLoginPlugin,
  type NativeSignInResult,
  signInNatively,
} from "@mobile/lib/native/social-login";
import { signOutAndReload } from "@mobile/lib/sign-out";
import { ActionButton } from "@mobile/seed-design/ui/action-button";
import {
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogRoot,
  AlertDialogTitle,
} from "@mobile/seed-design/ui/alert-dialog";
import { Callout } from "@mobile/seed-design/ui/callout";
import { List, ListItem } from "@mobile/seed-design/ui/list";
import { ProgressCircle } from "@mobile/seed-design/ui/progress-circle";

type Notice = { tone: "positive" | "neutral"; text: string };

/** 해제 확인. 거절되면 같은 다이얼로그가 이유(재로그인 필요 등)로 바뀐다. */
type UnlinkDialog =
  | { kind: "closed" }
  | { kind: "confirm"; row: LoginMethodRow; pending: boolean }
  | { kind: "failed"; code: string | undefined };

type ApiResult<T> = { data?: T | null; error?: { code?: string } | null } | null | undefined;

function rowDetail(row: LoginMethodRow): string {
  if (!row.accountRowId) return "연결 안 됨";
  return row.canUnlink ? "연결됨" : "연결됨 · 하나뿐인 로그인 수단은 해제할 수 없어요";
}

/**
 * 설정 → 로그인 수단. 이 계정에 연결된 카카오·Apple 을 보여 주고 다른 수단을 연결·해제한다
 * (`lib/login-methods.ts`). 연결은 제공자 화면을 다녀오는 왕복이라 결과는 돌아온 주소로 안내한다.
 */
export function LoginMethodsMobile({
  returnParams,
  onReturnParamsShown,
}: {
  /** 연결하고 돌아온 주소의 쿼리 (스택 activity params). */
  returnParams: LinkResultParams;
  /** 안내를 띄운 뒤 주소에서 결과를 지운다 — 새로고침해도 다시 나오지 않게. */
  onReturnParamsShown: () => void;
}) {
  const appleEnabled = useAppleSignInEnabled();
  const [accounts, setAccounts] = useState<LinkedAccount[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [returnResult] = useState(() => linkResultFrom(returnParams));
  const [notice, setNotice] = useState<Notice | null>(() =>
    returnResult ? linkResultMessage(returnResult) : null
  );
  const [linking, setLinking] = useState<SocialProvider | null>(null);
  const [dialog, setDialog] = useState<UnlinkDialog>({ kind: "closed" });

  useEffect(() => {
    if (returnResult) onReturnParamsShown();
  }, [returnResult, onReturnParamsShown]);

  // 제공자 화면에서 뒤로가기로 돌아오면 (bfcache) 떠날 때의 진행 상태가 남아 있다.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setLinking(null);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const loadAccounts = useCallback(async () => {
    try {
      const response: ApiResult<LinkedAccount[]> = await authClient.listAccounts();
      if (response?.data && !response.error) {
        setAccounts(response.data);
        setLoadFailed(false);
        return;
      }
    } catch {
      // 아래에서 실패로 알린다.
    }
    setLoadFailed(true);
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const link = async (provider: SocialProvider) => {
    setLinking(provider);
    setNotice(null);
    // 네이티브 앱: 카카오 SDK·Sign in with Apple 의 ID 토큰으로 이 화면에서 바로 연결한다.
    const native = hasNativeLoginPlugin(provider) ? await signInNatively(provider) : null;
    if (native) {
      await linkNatively(provider, native);
      return;
    }
    try {
      // 성공하면 클라이언트가 제공자 화면으로 이동한다 — 진행 상태를 유지한다.
      const response: ApiResult<unknown> = await authClient.linkSocial({
        provider,
        ...linkCallbackURLs(LOGIN_METHODS_PATH, provider),
      });
      if (!response?.error) return;
    } catch {
      // 아래에서 실패로 알린다.
    }
    setLinking(null);
    setNotice(linkResultMessage({ provider, error: "unknown" }));
  };

  const linkNatively = async (provider: SocialProvider, native: NativeSignInResult) => {
    let error: string | null = "unknown";
    if (native.status === "cancelled") error = "user_cancelled_authorize";
    if (native.status === "ok") {
      try {
        const response: ApiResult<unknown> = await authClient.linkSocial({
          provider,
          idToken: native.idToken,
        });
        error = response?.error ? (response.error.code ?? "unknown").toLowerCase() : null;
      } catch {
        error = "unknown";
      }
    }
    setLinking(null);
    setNotice(linkResultMessage({ provider, error }));
    if (error === null) await loadAccounts();
  };

  const unlink = async (row: LoginMethodRow) => {
    if (!row.accountRowId) return;
    setDialog({ kind: "confirm", row, pending: true });
    let code: string | undefined;
    try {
      const response: ApiResult<unknown> = await authClient.unlinkAccount({
        accountId: row.accountRowId,
      });
      if (!response?.error) {
        // 이 기기의 "최근에 …로 로그인했어요" 가 더는 이 계정으로 들어올 수 없는 수단을 가리키지 않게 한다.
        forgetLastLoginMethod(getDeviceStorage(), row.provider);
        setDialog({ kind: "closed" });
        setNotice({ tone: "neutral", text: `${row.label} 연결을 해제했어요.` });
        await loadAccounts();
        return;
      }
      code = response.error.code;
    } catch {
      code = undefined;
    }
    setDialog({ kind: "failed", code });
  };

  const signInAgain = signOutAndReload;

  const rows = accounts
    ? loginMethodRows(accounts, { appleEnabled, available: canSignInWith })
    : [];

  return (
    <div className="flex flex-col gap-x4 pb-x6">
      <p className="t4-regular text-fg-neutral-muted px-x4 pt-x4 break-keep">
        여러 로그인 수단을 연결해 두면 어느 쪽으로 로그인해도 같은 계정이에요. 연결하지 않은
        수단으로 로그인하면 새 계정이 만들어지고 데이터가 따로 저장돼요.
      </p>

      {notice && (
        <div role="status" className="px-x4">
          <Callout tone={notice.tone} description={notice.text} />
        </div>
      )}

      {accounts === null && !loadFailed && (
        <div className="flex justify-center py-x6">
          <ProgressCircle size="24" aria-label="로그인 수단을 불러오는 중" />
        </div>
      )}

      {loadFailed && (
        <div role="alert" className="flex flex-col gap-x2 px-x4">
          <Callout tone="neutral" description="로그인 수단을 불러오지 못했어요." />
          <ActionButton variant="neutralWeak" size="medium" onClick={() => void loadAccounts()}>
            다시 시도
          </ActionButton>
        </div>
      )}

      {accounts !== null && (
        <List>
          {rows.map((row) => (
            <ListItem
              key={row.provider}
              title={row.label}
              detail={rowDetail(row)}
              suffix={
                row.accountRowId ? (
                  row.canUnlink && (
                    <ActionButton
                      variant="neutralWeak"
                      size="small"
                      aria-label={`${row.label} 연결 해제`}
                      onClick={() => setDialog({ kind: "confirm", row, pending: false })}
                    >
                      해제
                    </ActionButton>
                  )
                ) : (
                  <ActionButton
                    variant="neutralSolid"
                    size="small"
                    aria-label={`${row.label} 연결`}
                    loading={linking === row.provider}
                    disabled={linking !== null && linking !== row.provider}
                    onClick={() => link(row.provider)}
                  >
                    연결
                  </ActionButton>
                )
              }
            />
          ))}
        </List>
      )}

      <AlertDialogRoot
        open={dialog.kind !== "closed"}
        onOpenChange={(open) => {
          if (!open && !(dialog.kind === "confirm" && dialog.pending))
            setDialog({ kind: "closed" });
        }}
      >
        <AlertDialogContent>
          {dialog.kind === "confirm" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{dialog.row.label} 연결을 해제할까요?</AlertDialogTitle>
                <AlertDialogDescription>
                  해제하면 {dialog.row.label}로 이 계정에 로그인할 수 없어요. 연결해 둔 다른
                  수단으로 로그인해 주세요.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <div className="flex w-full gap-x2">
                  <AlertDialogAction
                    variant="neutralWeak"
                    size="large"
                    flexGrow
                    disabled={dialog.pending}
                  >
                    취소
                  </AlertDialogAction>
                  <ActionButton
                    variant="criticalSolid"
                    size="large"
                    flexGrow
                    loading={dialog.pending}
                    onClick={() => unlink(dialog.row)}
                  >
                    해제하기
                  </ActionButton>
                </div>
              </AlertDialogFooter>
            </>
          )}
          {dialog.kind === "failed" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {dialog.code === "SESSION_NOT_FRESH"
                    ? "다시 로그인이 필요해요"
                    : "해제하지 못했어요"}
                </AlertDialogTitle>
                <AlertDialogDescription>{unlinkErrorMessage(dialog.code)}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <div className="flex w-full gap-x2">
                  <AlertDialogAction variant="neutralWeak" size="large" flexGrow>
                    닫기
                  </AlertDialogAction>
                  {dialog.code === "SESSION_NOT_FRESH" && (
                    <ActionButton
                      variant="neutralSolid"
                      size="large"
                      flexGrow
                      onClick={signInAgain}
                    >
                      다시 로그인
                    </ActionButton>
                  )}
                </div>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialogRoot>
    </div>
  );
}
