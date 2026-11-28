import { db } from "@seedbook/database";
import { isAppBundleChannel, isAppBundleId, NO_APP_BUNDLE } from "@seedbook/domain/app-bundle";
import { parseAppVersion } from "@seedbook/domain/app-version";
import { findLatestBundle } from "@web/server/app-bundles/app-bundles";
import { withDbTimeout } from "@web/server/db-timeout";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };
/** 기기 id 모양 (앱이 만드는 무작위 UUID). 다르면 모르는 기기로 본다. */
const DEVICE_PATTERN = /^[0-9a-zA-Z-]{8,64}$/;

/**
 * 네이티브 앱이 받을 OTA 번들 (`?native=<바이너리 버전>&channel=<beta|production>&current=<쓰는 번들 id>
 * &device=<기기 id>`, `lib/native/live-update.ts`). 로그인 전에도 부른다 — 인증이 필요 없다. 번들이 없거나
 * 값이 틀리거나 DB 가 답하지 않으면 "받을 것 없음" 으로 답한다 — 앱은 지금 번들 그대로 돈다.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const native = params.get("native") ?? "";
  const channel = params.get("channel") ?? "production";
  const current = params.get("current");
  const device = params.get("device");
  if (!parseAppVersion(native) || !isAppBundleChannel(channel)) {
    return Response.json(NO_APP_BUNDLE, { headers: NO_STORE });
  }
  try {
    const latest = await withDbTimeout(() =>
      findLatestBundle(db, {
        native,
        channel,
        current: current && isAppBundleId(current) ? current : null,
        device: device && DEVICE_PATTERN.test(device) ? device : null,
      })
    );
    return Response.json(latest, { headers: NO_STORE });
  } catch (error) {
    console.error("[app-bundle] latest 를 읽지 못했다", error);
    return Response.json(NO_APP_BUNDLE, { headers: NO_STORE });
  }
}
