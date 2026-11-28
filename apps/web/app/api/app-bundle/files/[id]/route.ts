import { db } from "@seedbook/database";
import { isAppBundleId } from "@seedbook/domain/app-bundle";
import { readBundleFile } from "@web/server/app-bundles/app-bundles";

export const dynamic = "force-dynamic";

/**
 * OTA 번들 zip (`/api/app-bundle/latest` 가 알려 준 경로). 플러그인이 네이티브로 내려받고 체크섬·서명을
 * 확인한다. 같은 id 의 본문은 바뀌지 않지만, 내려진 번들은 곧바로 404 가 되도록 캐시는 짧게 둔다.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isAppBundleId(id)) return Response.json({ error: "not found" }, { status: 404 });
  const data = await readBundleFile(db, id);
  if (!data) return Response.json({ error: "not found" }, { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": "application/zip",
      "content-length": String(data.length),
      "cache-control": "private, max-age=300",
    },
  });
}
