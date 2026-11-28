// 머지 큐 배포 확인(scripts/check-deploy.mjs)의 순수 로직. 테스트: apps/web/test/check-deploy/

const SHARED_PATHS = [
  "packages/database/src/**",
  "packages/database/package.json",
  "packages/database/tsconfig.json",
  "packages/domain/src/**",
  "packages/domain/package.json",
  "packages/typescript-config/**",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  ".npmrc",
  ".dockerignore",
  "docker-compose.yml",
  ".github/workflows/deploy-service.yml",
];

/**
 * 서비스별 배포 워크플로와 그 `on.push.paths`. 워크플로 파일의 paths 와 같아야 한다
 * (check-deploy-lib.test.ts 가 워크플로 파일을 읽어 비교한다).
 */
export const DEPLOY_WORKFLOWS = [
  {
    file: "deploy-web.yml",
    paths: [
      "apps/web/**",
      // 웹 이미지는 앱 화면(Vite SPA)도 빌드해 같이 서빙한다. 네이티브 프로젝트(android·ios)는 빼고.
      "apps/mobile/src/**",
      "apps/mobile/public/**",
      "apps/mobile/index.html",
      "apps/mobile/package.json",
      "apps/mobile/tsconfig.json",
      "apps/mobile/vite.config.ts",
      "apps/mobile/postcss.config.js",
      "packages/tailwind-config/**",
      ...SHARED_PATHS,
      ".github/workflows/deploy-web.yml",
    ],
  },
  {
    file: "deploy-crawler.yml",
    paths: [
      "apps/stock-crawler/**",
      "packages/database/migrations/**",
      "packages/database/scripts/migrate.ts",
      "packages/database/scripts/backfill-*.ts",
      ...SHARED_PATHS,
      ".github/workflows/deploy-crawler.yml",
    ],
  },
];

/**
 * GitHub `paths` 필터 중 이 레포가 쓰는 모양만: `dir/**` (그 아래 전부), `*` (`/` 를 넘지 않음),
 * 나머지는 정확히 일치.
 * @param {string} file
 * @param {string} pattern
 */
export function matchesPath(file, pattern) {
  if (pattern.endsWith("/**")) return file.startsWith(pattern.slice(0, -2));
  if (!pattern.includes("*")) return file === pattern;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
  return new RegExp(`^${escaped}$`).test(file);
}

/**
 * 머지 커밋에서 바뀐 파일로, push run 이 생겨야 하는 배포 워크플로 파일 이름들.
 * 빈 배열이면 배포할 것이 없다 (문서·dev 전용 파일만 바뀜).
 * @param {string[]} changedFiles
 * @returns {string[]}
 */
export function expectedWorkflows(changedFiles) {
  return DEPLOY_WORKFLOWS.filter(({ paths }) =>
    changedFiles.some((file) => paths.some((pattern) => matchesPath(file, pattern)))
  ).map(({ file }) => file);
}

/**
 * 머지 커밋의 배포 run 을 고른다. main push 로 시작된 run 만 보고
 * (수동 Run workflow 는 제외), 여러 개면 가장 최근 것.
 * @template {{ headSha: string, event: string, createdAt: string }} Run
 * @param {Run[]} runs
 * @param {string} sha
 * @returns {Run | null}
 */
export function findDeployRun(runs, sha) {
  const candidates = runs
    .filter((r) => r.headSha === sha && r.event === "push")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return candidates[0] ?? null;
}

/**
 * 대기 중에 다음 push 로 취소된 run 을 이어받은 run — 같은 워크플로에서 그 뒤에 생긴 push run 중
 * 가장 오래된 것. 다음 run 이 최신 코드로 서비스 전체를 빌드하므로 그 결과가 곧 이 커밋의 배포다.
 * @template {{ databaseId: number, event: string, createdAt: string }} Run
 * @param {Run[]} runs 같은 워크플로의 main push run 들
 * @param {Run} cancelled
 * @returns {Run | null}
 */
export function successorRun(runs, cancelled) {
  const later = runs
    .filter((r) => r.event === "push" && r.createdAt > cancelled.createdAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return later[0] ?? null;
}

/**
 * @param {{ status: string, conclusion: string } | null} run
 * @returns {"missing" | "pending" | "success" | "cancelled" | "failure"}
 */
export function runVerdict(run) {
  if (!run) return "missing";
  if (run.status !== "completed") return "pending";
  if (run.conclusion === "success") return "success";
  return run.conclusion === "cancelled" ? "cancelled" : "failure";
}

const OK_CONCLUSIONS = new Set(["success", "skipped", "neutral"]);

/**
 * 실패한 run 의 job 에서 실패한 step 을 "job / step" 으로. 실패한 step 이 없는
 * 실패 job(취소 등)은 "job (conclusion)".
 * @param {Array<{ name: string, conclusion: string, steps?: Array<{ name: string, conclusion: string }> }>} jobs
 */
export function failedStepNames(jobs) {
  return jobs.flatMap((job) => {
    if (OK_CONCLUSIONS.has(job.conclusion)) return [];
    const steps = (job.steps ?? []).filter((step) => step.conclusion === "failure");
    if (steps.length === 0) return [`${job.name} (${job.conclusion})`];
    return steps.map((step) => `${job.name} / ${step.name}`);
  });
}
