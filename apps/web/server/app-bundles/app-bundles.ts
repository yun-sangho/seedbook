import { createHash } from "node:crypto";
import { type Database, schema } from "@seedbook/database";
import {
  APP_BUNDLE_OUTCOMES,
  type AppBundleChannel,
  type AppBundleOutcome,
  type AppBundleReportCounts,
  bundleFitsNative,
  inRollout,
  type LatestAppBundleResponse,
  NO_APP_BUNDLE,
  shouldHaltBundle,
} from "@seedbook/domain/app-bundle";
import { and, desc, eq, inArray, isNotNull, isNull, notInArray, sql } from "drizzle-orm";

/**
 * OTA 앱 번들 저장소 (`app_bundle`·`app_bundle_file`·`app_bundle_report`). 규칙은
 * `@seedbook/domain/app-bundle` 이 정하고, 여기는 DB 를 읽고 쓴다. 라우트는 `app/api/app-bundle/`.
 */

const { appBundle, appBundleFile, appBundleReport } = schema;

/** 내려받을 수 있게 본문을 남기는 최근 번들 수 (그 밖에 승격된 번들 몇 개). 나머지 본문은 지운다. */
export const KEEP_RECENT_FILES = 10;
export const KEEP_PROMOTED_FILES = 3;
/** 받을 번들을 찾을 때 보는 후보 수. 바이너리·단계 배포가 맞지 않으면 그 다음 것을 본다. */
const CANDIDATES = 20;

export function bundleFilePath(id: string): string {
  return `/api/app-bundle/files/${id}`;
}

/** 공개 응답에 싣는 열 (본문·보고는 빼고). */
const offerColumns = {
  id: appBundle.id,
  appVersion: appBundle.appVersion,
  minNative: appBundle.minNative,
  build: appBundle.build,
  checksum: appBundle.checksum,
  signature: appBundle.signature,
  rolloutPercent: appBundle.rolloutPercent,
};

export interface LatestBundleQuery {
  /** 기기 바이너리 버전 (semver). */
  native: string;
  channel: AppBundleChannel;
  /** 기기가 지금 쓰는 번들 id. 내장 번들이면 null. */
  current: string | null;
  /** 기기 id (단계 배포 자리). 모르면 null. */
  device: string | null;
}

/**
 * 기기가 받을 번들. beta 는 내려지지 않은 가장 새 번들, production 은 승격된 번들 중 가장 늦게 승격된
 * 것부터 이 기기의 바이너리·단계 배포 자리에 맞는 첫 번들. 본문을 지운 번들은 주지 않는다.
 */
export async function findLatestBundle(
  db: Database,
  query: LatestBundleQuery
): Promise<LatestAppBundleResponse> {
  const production = query.channel === "production";
  const candidates = await db
    .select(offerColumns)
    .from(appBundle)
    .innerJoin(appBundleFile, eq(appBundleFile.bundleId, appBundle.id))
    .where(
      and(isNull(appBundle.haltedAt), production ? isNotNull(appBundle.promotedAt) : undefined)
    )
    .orderBy(desc(production ? appBundle.promotedAt : appBundle.createdAt), desc(appBundle.id))
    .limit(CANDIDATES);

  const offer = candidates.find(
    (bundle) =>
      bundleFitsNative(bundle, query.native) &&
      (!production || inRollout(bundle.id, query.device, bundle.rolloutPercent))
  );
  if (offer) {
    return {
      bundle: {
        id: offer.id,
        appVersion: offer.appVersion,
        build: offer.build,
        url: bundleFilePath(offer.id),
        checksum: offer.checksum,
        signature: offer.signature,
      },
      reset: false,
    };
  }
  if (!query.current) return NO_APP_BUNDLE;
  // 받을 번들이 없다. 지금 쓰는 번들이 내려졌으면 내장 번들로 돌아가게 한다.
  const [current] = await db
    .select({ haltedAt: appBundle.haltedAt })
    .from(appBundle)
    .where(eq(appBundle.id, query.current));
  return { bundle: null, reset: current?.haltedAt != null };
}

/** 번들 zip. 없거나 내려진 번들이면 null. */
export async function readBundleFile(db: Database, id: string): Promise<Buffer | null> {
  const [row] = await db
    .select({ data: appBundleFile.data })
    .from(appBundleFile)
    .innerJoin(appBundle, eq(appBundle.id, appBundleFile.bundleId))
    .where(and(eq(appBundleFile.bundleId, id), isNull(appBundle.haltedAt)));
  return row?.data ?? null;
}

export async function reportCounts(db: Database, bundleId: string): Promise<AppBundleReportCounts> {
  const rows = await db
    .select({ outcome: appBundleReport.outcome, count: sql<number>`count(*)::int` })
    .from(appBundleReport)
    .where(eq(appBundleReport.bundleId, bundleId))
    .groupBy(appBundleReport.outcome);
  const counts = Object.fromEntries(
    APP_BUNDLE_OUTCOMES.map((o) => [o, 0])
  ) as AppBundleReportCounts;
  for (const { outcome, count } of rows) {
    if (outcome in counts) counts[outcome as AppBundleOutcome] = count;
  }
  return counts;
}

export interface BundleReport {
  bundleId: string;
  installId: string;
  outcome: AppBundleOutcome;
}

/**
 * 기기의 적용 결과를 남긴다 (기기·결과마다 한 번). 실패가 자동 중단 기준을 넘으면 번들을 내린다.
 * 모르는 번들이면 `unknown` — 지운 번들을 쓰는 옛 기기가 보낼 수 있다.
 */
export async function recordBundleReport(
  db: Database,
  report: BundleReport,
  now: Date = new Date()
): Promise<"recorded" | "halted" | "unknown"> {
  const [bundle] = await db
    .select({ haltedAt: appBundle.haltedAt })
    .from(appBundle)
    .where(eq(appBundle.id, report.bundleId));
  if (!bundle) return "unknown";
  await db
    .insert(appBundleReport)
    .values({ ...report, createdAt: now })
    .onConflictDoNothing();
  if (report.outcome === "applied" || report.outcome === "download_failed") return "recorded";
  if (bundle.haltedAt) return "recorded";

  const counts = await reportCounts(db, report.bundleId);
  if (!shouldHaltBundle(counts)) return "recorded";
  const halted = await db
    .update(appBundle)
    .set({
      haltedAt: now,
      haltReason: `자동 중단: 롤백 ${counts.rolled_back}, 검증 실패 ${counts.verify_failed}, 적용 ${counts.applied}`,
    })
    .where(and(eq(appBundle.id, report.bundleId), isNull(appBundle.haltedAt)))
    .returning({ id: appBundle.id });
  return halted.length > 0 ? "halted" : "recorded";
}

export interface PublishBundleInput {
  id: string;
  appVersion: string;
  minNative: string;
  build: string;
  checksum: string;
  signature: string;
  data: Buffer;
}

export type PublishResult = "published" | "exists" | "checksum_mismatch";

/** 번들을 올린다 (beta 채널). 본문의 SHA-256 이 `checksum` 과 다르면 받지 않는다. */
export async function publishBundle(
  db: Database,
  input: PublishBundleInput,
  now: Date = new Date()
): Promise<PublishResult> {
  const actual = createHash("sha256").update(input.data).digest("hex");
  if (actual !== input.checksum) return "checksum_mismatch";
  const { data, ...meta } = input;
  const inserted = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(appBundle)
      .values({ ...meta, size: data.length, createdAt: now })
      .onConflictDoNothing()
      .returning({ id: appBundle.id });
    if (rows.length === 0) return false;
    await tx.insert(appBundleFile).values({ bundleId: input.id, data });
    return true;
  });
  if (!inserted) return "exists";
  await pruneBundleFiles(db);
  return "published";
}

/**
 * 오래된 번들 본문을 지운다 (메타·보고는 남긴다). 최근 {@link KEEP_RECENT_FILES} 개와, 내려지지 않은
 * 승격 번들 중 최근 {@link KEEP_PROMOTED_FILES} 개는 남긴다 — production 이 아직 그것을 내준다.
 */
export async function pruneBundleFiles(db: Database): Promise<void> {
  const recent = await db
    .select({ id: appBundle.id })
    .from(appBundle)
    .orderBy(desc(appBundle.createdAt), desc(appBundle.id))
    .limit(KEEP_RECENT_FILES);
  const promoted = await db
    .select({ id: appBundle.id })
    .from(appBundle)
    .where(and(isNotNull(appBundle.promotedAt), isNull(appBundle.haltedAt)))
    .orderBy(desc(appBundle.promotedAt), desc(appBundle.id))
    .limit(KEEP_PROMOTED_FILES);
  const keep = [...new Set([...recent, ...promoted].map((row) => row.id))];
  if (keep.length === 0) return;
  await db.delete(appBundleFile).where(notInArray(appBundleFile.bundleId, keep));
}

export type PromoteResult = "promoted" | "not_found" | "halted" | "no_file";

/** production 채널에 올린다 (`rolloutPercent` 만큼의 기기). 이미 승격했으면 비율만 바꾼다. */
export async function promoteBundle(
  db: Database,
  id: string,
  rolloutPercent: number,
  now: Date = new Date()
): Promise<PromoteResult> {
  const [bundle] = await db
    .select({
      haltedAt: appBundle.haltedAt,
      promotedAt: appBundle.promotedAt,
      file: appBundleFile.bundleId,
    })
    .from(appBundle)
    .leftJoin(appBundleFile, eq(appBundleFile.bundleId, appBundle.id))
    .where(eq(appBundle.id, id));
  if (!bundle) return "not_found";
  if (bundle.haltedAt) return "halted";
  if (!bundle.file) return "no_file";
  await db
    .update(appBundle)
    .set({ promotedAt: bundle.promotedAt ?? now, rolloutPercent })
    .where(eq(appBundle.id, id));
  return "promoted";
}

/** 번들을 내린다 — 어느 채널에도 내주지 않고, 쓰던 기기는 다른 번들이나 내장 번들로 돌아간다. */
export async function haltBundle(
  db: Database,
  id: string,
  reason: string,
  now: Date = new Date()
): Promise<"halted" | "not_found"> {
  const rows = await db
    .update(appBundle)
    .set({ haltedAt: now, haltReason: reason })
    .where(eq(appBundle.id, id))
    .returning({ id: appBundle.id });
  return rows.length > 0 ? "halted" : "not_found";
}

export interface BundleSummary {
  id: string;
  appVersion: string;
  minNative: string;
  build: string;
  size: number;
  createdAt: Date;
  promotedAt: Date | null;
  rolloutPercent: number;
  haltedAt: Date | null;
  haltReason: string | null;
  hasFile: boolean;
  reports: AppBundleReportCounts;
}

/** 운영자용 최근 번들 목록 (보고 수 포함). */
export async function listBundles(db: Database, limit = 20): Promise<BundleSummary[]> {
  const rows = await db
    .select({
      id: appBundle.id,
      appVersion: appBundle.appVersion,
      minNative: appBundle.minNative,
      build: appBundle.build,
      size: appBundle.size,
      createdAt: appBundle.createdAt,
      promotedAt: appBundle.promotedAt,
      rolloutPercent: appBundle.rolloutPercent,
      haltedAt: appBundle.haltedAt,
      haltReason: appBundle.haltReason,
      file: appBundleFile.bundleId,
    })
    .from(appBundle)
    .leftJoin(appBundleFile, eq(appBundleFile.bundleId, appBundle.id))
    .orderBy(desc(appBundle.createdAt), desc(appBundle.id))
    .limit(limit);
  const ids = rows.map((row) => row.id);
  const reports =
    ids.length === 0
      ? []
      : await db
          .select({
            bundleId: appBundleReport.bundleId,
            outcome: appBundleReport.outcome,
            count: sql<number>`count(*)::int`,
          })
          .from(appBundleReport)
          .where(inArray(appBundleReport.bundleId, ids))
          .groupBy(appBundleReport.bundleId, appBundleReport.outcome);
  return rows.map(({ file, ...row }) => {
    const counts = Object.fromEntries(
      APP_BUNDLE_OUTCOMES.map((o) => [o, 0])
    ) as AppBundleReportCounts;
    for (const report of reports) {
      if (report.bundleId === row.id && report.outcome in counts) {
        counts[report.outcome as AppBundleOutcome] = report.count;
      }
    }
    return { ...row, hasFile: file !== null, reports: counts };
  });
}
