import { accountFetch, releaseAccountSlot } from "@mobile/lib/account-storage";
import type { ConsentDocument, LegalNotice } from "@mobile/lib/legal/catalog";

const CONSENTS_URL = "/api/me/consents";

/**
 * 동의 확인을 기다리는 최대 시간. 앱을 열 때마다 이 응답을 기다리며 스피너를 보여 주므로, 서버가
 * 답하지 않으면 포기하고 "다시 시도" 를 보여 준다 (T34 — 서버가 응답 없이 멈춰 스피너에 갇혔다).
 */
export const CONSENT_CHECK_TIMEOUT_MS = 15_000;

export type ConsentStatus =
  | { kind: "agreed"; notices: LegalNotice[] }
  | { kind: "required"; newSignUp: boolean; documents: ConsentDocument[] }
  | { kind: "failed" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDocumentLike(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.document === "string" &&
    typeof value.title === "string" &&
    typeof value.version === "string" &&
    typeof value.effectiveDate === "string"
  );
}

/** 확인하지 못하면(시간 초과 포함) `failed` — 동의한 것으로 보지 않는다. */
export async function fetchConsentStatus(): Promise<ConsentStatus> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException("consent check timed out", "TimeoutError")),
    CONSENT_CHECK_TIMEOUT_MS
  );
  try {
    const response = await accountFetch(CONSENTS_URL, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return { kind: "failed" };
    const body = (await response.json()) as Record<string, unknown>;
    if (body.agreed === true) {
      // 안내는 덤이다 — 모양이 틀려도 앱은 연다.
      const notices = Array.isArray(body.notices) ? body.notices.filter(isDocumentLike) : [];
      return { kind: "agreed", notices: notices as LegalNotice[] };
    }
    const { documents } = body;
    if (
      body.agreed !== false ||
      !Array.isArray(documents) ||
      documents.length === 0 ||
      !documents.every(isDocumentLike)
    ) {
      return { kind: "failed" };
    }
    return {
      kind: "required",
      newSignUp: body.newSignUp === true,
      documents: documents as ConsentDocument[],
    };
  } catch {
    return { kind: "failed" };
  } finally {
    clearTimeout(timer);
  }
}

/** `changed`: 화면을 연 뒤 약관이 개정됨 — 새로고침해 다시 보여 준다. */
export async function submitConsent(
  documents: readonly ConsentDocument[]
): Promise<"agreed" | "changed" | "failed"> {
  try {
    const response = await accountFetch(CONSENTS_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        versions: Object.fromEntries(documents.map(({ document, version }) => [document, version])),
      }),
    });
    if (response.ok) return "agreed";
    return response.status === 409 ? "changed" : "failed";
  } catch {
    return "failed";
  }
}

/** 동의를 거부한다. 방금 만든 계정이면 서버가 지우고, 이 기기의 자리도 놓아 준다. */
export async function declineConsent(): Promise<boolean> {
  try {
    const response = await accountFetch(CONSENTS_URL, { method: "DELETE" });
    if (!response.ok) return false;
    const { deleted } = (await response.json()) as { deleted?: unknown };
    if (deleted === true) await releaseAccountSlot();
    return true;
  } catch {
    return false;
  }
}
