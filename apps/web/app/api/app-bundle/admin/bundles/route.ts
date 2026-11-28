import { db } from "@seedbook/database";
import { isAppBundleId } from "@seedbook/domain/app-bundle";
import { parseAppVersion } from "@seedbook/domain/app-version";
import { rejectNonAdmin } from "@web/server/app-bundles/admin-token";
import { listBundles, publishBundle } from "@web/server/app-bundles/app-bundles";

export const dynamic = "force-dynamic";

/** 올릴 수 있는 zip 최대 크기 (지금 번들은 약 0.5MB). */
const MAX_BUNDLE_BYTES = 8 * 1024 * 1024;
const HEX_SHA256 = /^[0-9a-f]{64}$/;
const BUILD = /^[0-9a-f]{7,40}$/;

/** 운영자: 최근 번들과 기기 보고 수. */
export async function GET(request: Request) {
  const rejected = rejectNonAdmin(request);
  if (rejected) return rejected;
  return Response.json({ bundles: await listBundles(db) });
}

/**
 * 운영자: 번들을 올린다 (beta 채널). 본문은 zip, 메타는 쿼리
 * (`id`·`appVersion`·`minNative`·`build`·`checksum`·`signature`). 서명은 워크플로가 앱의 공개 키로 이미
 * 확인했다 (`scripts/app-bundle.mjs`). 서버는 본문의 체크섬만 다시 확인한다.
 */
export async function POST(request: Request) {
  const rejected = rejectNonAdmin(request);
  if (rejected) return rejected;
  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  const appVersion = params.get("appVersion") ?? "";
  const minNative = params.get("minNative") ?? appVersion;
  const build = params.get("build") ?? "";
  const checksum = params.get("checksum") ?? "";
  const signature = params.get("signature") ?? "";
  if (
    !isAppBundleId(id) ||
    !parseAppVersion(appVersion) ||
    !parseAppVersion(minNative) ||
    !BUILD.test(build) ||
    !HEX_SHA256.test(checksum) ||
    signature.length === 0
  ) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const data = Buffer.from(await request.arrayBuffer());
  if (data.length === 0 || data.length > MAX_BUNDLE_BYTES) {
    return Response.json({ error: "bad size" }, { status: 400 });
  }
  const result = await publishBundle(db, {
    id,
    appVersion,
    minNative,
    build,
    checksum,
    signature,
    data,
  });
  const status = result === "published" ? 201 : result === "exists" ? 409 : 400;
  return Response.json({ result }, { status });
}
