import { accountFetch, releaseAccountSlot } from "@web/lib/account-storage";
import type { ConsentDocument, LegalNotice } from "@web/lib/legal/catalog";

const CONSENTS_URL = "/api/me/consents";

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

/** 확인하지 못하면 `failed` — 동의한 것으로 보지 않는다. */
export async function fetchConsentStatus(): Promise<ConsentStatus> {
  try {
    const response = await accountFetch(CONSENTS_URL, { cache: "no-store" });
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
