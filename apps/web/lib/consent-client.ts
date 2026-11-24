import { accountFetch, releaseAccountSlot } from "@web/lib/account-storage";
import { LEGAL_DOCUMENTS } from "@web/lib/legal-documents";

const CONSENTS_URL = "/api/me/consents";

export type ConsentStatus =
  | { kind: "agreed" }
  | { kind: "required"; newSignUp: boolean }
  | { kind: "failed" };

/** 확인하지 못하면 `failed` — 동의한 것으로 보지 않는다. */
export async function fetchConsentStatus(): Promise<ConsentStatus> {
  try {
    const response = await accountFetch(CONSENTS_URL, { cache: "no-store" });
    if (!response.ok) return { kind: "failed" };
    const body = (await response.json()) as { agreed?: unknown; newSignUp?: unknown };
    if (body.agreed === true) return { kind: "agreed" };
    if (body.agreed !== false) return { kind: "failed" };
    return { kind: "required", newSignUp: body.newSignUp === true };
  } catch {
    return { kind: "failed" };
  }
}

/** `changed`: 화면을 연 뒤 약관이 개정됨 — 새로고침해 다시 보여 준다. */
export async function submitConsent(): Promise<"agreed" | "changed" | "failed"> {
  try {
    const response = await accountFetch(CONSENTS_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        versions: Object.fromEntries(LEGAL_DOCUMENTS.map(({ id, version }) => [id, version])),
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
