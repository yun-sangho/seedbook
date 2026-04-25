/**
 * Seedbook export JSON → user-data fixture 변환.
 *
 * `/admin` export 가 만든 envelope 에서 owner 필드(accountOwner/loanOwner/
 * assetOwner)를 제거하고, 인명이 들어간 계좌명을 종류별 일련번호로 정규화해
 * `seed-data/user-data.json` 으로 떨어뜨린다. seed.ts 가 이 fixture 를 읽어
 * dev 유저의 자산 데이터로 재생한다.
 *
 * 실행:
 *   pnpm --filter @seedbook/database db:sanitize:user-export -- \
 *     --input ~/Downloads/seedbook-data-2026-04-14.json
 *
 * 출력 envelope shape (apps/web/app/admin/page.tsx 의 import 와 호환):
 *   { investments, savings, realAssets, debts, progressPoints, exportedAt, version }
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";

const SEED_DATA_DIR = resolve(__dirname, "../prisma/seed-data");
const OUTPUT_PATH = resolve(SEED_DATA_DIR, "user-data.json");
// 데모 데이터 버튼이 fetch 로 읽을 정적 파일. fixture 단일 출처를 유지하기 위해
// sanitize 가 두 곳을 동시에 갱신한다.
const PUBLIC_OUTPUT_PATH = resolve(
  __dirname,
  "../../../apps/web/public/seed-data/user-data.json"
);

type Bag = Record<string, unknown>;

function expandHome(p: string): string {
  return p.startsWith("~") ? p.replace(/^~/, homedir()) : p;
}

function parseInput(): string {
  const argv = process.argv.slice(2);
  const idx = argv.findIndex((a) => a === "--input" || a === "-i");
  const value = idx >= 0 ? argv[idx + 1] : undefined;
  if (!value) {
    throw new Error("usage: sanitize-user-export --input <path-to-export.json>");
  }
  return resolve(process.cwd(), expandHome(value));
}

const STRIP_FIELDS = ["accountOwner", "loanOwner", "assetOwner"] as const;

function stripOwners<T extends Bag>(item: T): Omit<T, (typeof STRIP_FIELDS)[number]> {
  const next = { ...item };
  for (const f of STRIP_FIELDS) delete (next as Bag)[f];
  return next;
}

/**
 * accountName 정규화 — 인명이 섞인 자유 문자열을 "<accountType> <n>" 으로 일괄
 * 교체한다. 동일 accountType 안에서 카운터가 1부터 증가.
 */
function renameByType<T extends Bag>(items: T[], typeKey: string, suffix = ""): T[] {
  const counters = new Map<string, number>();
  return items.map((item) => {
    const type = String(item[typeKey] ?? "").trim() || "계좌";
    const next = (counters.get(type) ?? 0) + 1;
    counters.set(type, next);
    const nameKey = typeKey === "loanType" ? "loanName" : typeKey === "assetType" ? "assetName" : "accountName";
    return { ...item, [nameKey]: `${type}${suffix} ${next}` };
  });
}

function main(): void {
  const inputPath = parseInput();
  if (!existsSync(inputPath)) {
    throw new Error(`input not found: ${inputPath}`);
  }
  const raw = JSON.parse(readFileSync(inputPath, "utf8")) as Bag;

  const investments = (Array.isArray(raw.investments) ? raw.investments : []).map((x) =>
    stripOwners(x as Bag)
  ) as Bag[];
  const savings = (Array.isArray(raw.savings) ? raw.savings : []).map((x) =>
    stripOwners(x as Bag)
  ) as Bag[];
  const debts = (Array.isArray(raw.debts) ? raw.debts : []).map((x) =>
    stripOwners(x as Bag)
  ) as Bag[];
  const realAssets = (Array.isArray(raw.realAssets) ? raw.realAssets : []).map((x) =>
    stripOwners(x as Bag)
  ) as Bag[];
  const progressPoints = Array.isArray(raw.progressPoints) ? raw.progressPoints : [];

  const sanitized = {
    investments: renameByType(investments, "accountType"),
    savings: renameByType(savings, "accountType", " 계좌"),
    realAssets: renameByType(realAssets, "assetType"),
    debts: renameByType(debts, "loanType"),
    progressPoints,
    exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : new Date().toISOString(),
    version: typeof raw.version === "string" ? raw.version : "1.0",
  };

  if (!existsSync(SEED_DATA_DIR)) mkdirSync(SEED_DATA_DIR, { recursive: true });
  const serialized = JSON.stringify(sanitized, null, 2) + "\n";
  writeFileSync(OUTPUT_PATH, serialized);

  const publicDir = resolve(PUBLIC_OUTPUT_PATH, "..");
  if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });
  writeFileSync(PUBLIC_OUTPUT_PATH, serialized);

  console.log(`[sanitize] wrote ${OUTPUT_PATH}`);
  console.log(`[sanitize] wrote ${PUBLIC_OUTPUT_PATH}`);
  console.log(
    `[sanitize] counts: investments=${sanitized.investments.length}, savings=${sanitized.savings.length}, realAssets=${sanitized.realAssets.length}, debts=${sanitized.debts.length}, progressPoints=${sanitized.progressPoints.length}`
  );
}

main();
