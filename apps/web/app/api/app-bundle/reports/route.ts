import { db } from "@seedbook/database";
import { isAppBundleId, isAppBundleOutcome } from "@seedbook/domain/app-bundle";
import { recordBundleReport } from "@web/server/app-bundles/app-bundles";

export const dynamic = "force-dynamic";

const INSTALL_ID = /^[0-9a-zA-Z-]{8,64}$/;

/**
 * 기기가 보내는 OTA 번들 적용 결과 `{ bundleId, installId, outcome }` (`lib/native/live-update.ts`).
 * 실패가 기준을 넘으면 서버가 번들을 내린다 (`recordBundleReport`). 로그인과 상관없이 받는다 — 사용자와
 * 잇지 않는 기기 id 뿐이다. 앱은 답을 기다리지 않으니 늘 짧게 답한다.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const { bundleId, installId, outcome } = body as Record<string, unknown>;
  if (
    !isAppBundleId(bundleId) ||
    typeof installId !== "string" ||
    !INSTALL_ID.test(installId) ||
    !isAppBundleOutcome(outcome)
  ) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const result = await recordBundleReport(db, { bundleId, installId, outcome });
  if (result === "halted") console.warn(`[app-bundle] ${bundleId} 를 자동으로 내렸다 (${outcome})`);
  return Response.json({ result });
}
