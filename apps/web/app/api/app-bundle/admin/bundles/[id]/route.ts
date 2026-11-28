import { db } from "@seedbook/database";
import { isAppBundleId } from "@seedbook/domain/app-bundle";
import { rejectNonAdmin } from "@web/server/app-bundles/admin-token";
import { haltBundle, promoteBundle } from "@web/server/app-bundles/app-bundles";

export const dynamic = "force-dynamic";

/**
 * 운영자: 번들 하나를 바꾼다.
 * - `{ "action": "promote", "rolloutPercent": 0~100 }` — production 채널에 올린다 (그 비율의 기기만).
 *   내려진 번들은 올리지 않는다 (409).
 * - `{ "action": "halt", "reason": "…" }` — 어느 채널에도 내주지 않는다.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = rejectNonAdmin(request);
  if (rejected) return rejected;
  const { id } = await params;
  if (!isAppBundleId(id)) return Response.json({ error: "not found" }, { status: 404 });
  const body: unknown = await request.json().catch(() => null);
  const { action, rolloutPercent, reason } = (body ?? {}) as Record<string, unknown>;

  if (action === "promote") {
    if (
      typeof rolloutPercent !== "number" ||
      !Number.isInteger(rolloutPercent) ||
      rolloutPercent < 0 ||
      rolloutPercent > 100
    ) {
      return Response.json({ error: "rolloutPercent must be 0..100" }, { status: 400 });
    }
    const result = await promoteBundle(db, id, rolloutPercent);
    const status = { promoted: 200, not_found: 404, halted: 409, no_file: 409 }[result];
    return Response.json({ result }, { status });
  }
  if (action === "halt") {
    const text = typeof reason === "string" && reason.trim() ? reason.trim() : "운영자가 내림";
    const result = await haltBundle(db, id, text.slice(0, 500));
    return Response.json({ result }, { status: result === "halted" ? 200 : 404 });
  }
  return Response.json({ error: "unknown action" }, { status: 400 });
}
