// 배포 워크플로(.github/workflows/deploy.yml)의 changes job 이 쓰는 순수 로직.
// CLI: scripts/deploy-plan.mjs. 테스트: apps/web/test/deploy-plan/
//
// 비교 기준은 "마지막으로 성공한 배포 run 의 커밋" 이다. 배포 concurrency 가 대기 중인
// run 을 다음 push 로 취소해도, 다음 run 이 취소된 커밋의 변경까지 함께 배포한다.

// 각 이미지가 실제로 쓰는 경로 + 의존성 설치에 영향을 주는 루트 파일.
// packages/database 는 나눠서 본다:
//   - src · package.json · tsconfig → DB 클라이언트·스키마라 양쪽 다
//   - migrations · migrate.ts · backfill-* → 프로덕션에서 crawler 가 돌리므로 crawler 만
//   - seed-data · seed/capture/reset 스크립트 → dev 전용이라 어느 이미지도 다시 빌드하지 않음
// 워크플로·이 판단 스크립트가 바뀌면 빌드 설정이 바뀐 것일 수 있으니 둘 다 다시 빌드.
const SHARED = [
  "packages/database/src/**",
  "packages/database/package.json",
  "packages/database/tsconfig.json",
  "packages/typescript-config/**",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  ".npmrc",
  ".dockerignore",
  ".github/workflows/deploy.yml",
  "scripts/deploy-plan.mjs",
  "scripts/deploy-plan-lib.mjs",
];

/** 서비스 이름 = 이미지 이름 = apps/<name>/Dockerfile */
export const SERVICE_PATHS = {
  web: [...SHARED, "apps/web/**", "packages/tailwind-config/**"],
  "stock-crawler": [
    ...SHARED,
    "apps/stock-crawler/**",
    "packages/database/migrations/**",
    "packages/database/scripts/migrate.ts",
    "packages/database/scripts/backfill-*.ts",
  ],
};

/** 이 파일만 바뀌면 빌드 없이 재배포한다. */
export const COMPOSE_PATHS = ["docker-compose.yml"];

/** 마지막 배포로 치는 run 의 이벤트 (수동 Run workflow 는 롤백·재배포라 둘 다 배포한다) */
const DEPLOY_EVENTS = new Set(["push", "workflow_dispatch"]);

/**
 * 경로 패턴: `dir/**` (그 아래 전부), 마지막 조각의 `*` (`/` 를 넘지 않음), 나머지는 정확히 일치.
 * @param {string} file
 * @param {string} pattern
 */
export function matchesPath(file, pattern) {
  if (pattern.endsWith("/**")) return file.startsWith(pattern.slice(0, -2));
  if (!pattern.includes("*")) return file === pattern;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
  return new RegExp(`^${escaped}$`).test(file);
}

const touches = (files, patterns) => files.some((f) => patterns.some((p) => matchesPath(f, p)));

/**
 * 가장 최근에 성공한 배포 run 의 커밋. 지금 run 과 같은 브랜치(main)의 push·수동 실행만 본다.
 * @param {Array<{ head_sha: string, head_branch: string, event: string, status: string, conclusion: string | null, created_at: string }>} runs
 * @param {string} branch
 * @returns {string | null}
 */
export function lastDeployedSha(runs, branch) {
  const deployed = runs
    .filter(
      (r) =>
        r.head_branch === branch &&
        DEPLOY_EVENTS.has(r.event) &&
        r.status === "completed" &&
        r.conclusion === "success"
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return deployed[0]?.head_sha ?? null;
}

/**
 * 빌드할 서비스와 배포 여부.
 * `changedFiles` 가 null 이면 (수동 실행, 기준 커밋 없음·조회 실패·히스토리에 없음) 전체 배포.
 * @param {string[] | null} changedFiles
 * @returns {{ services: string[], deploy: boolean }}
 */
export function planDeploy(changedFiles) {
  if (changedFiles === null) return { services: Object.keys(SERVICE_PATHS), deploy: true };
  const services = Object.keys(SERVICE_PATHS).filter((name) =>
    touches(changedFiles, SERVICE_PATHS[name])
  );
  const deploy = services.length > 0 || touches(changedFiles, COMPOSE_PATHS);
  return { services, deploy };
}
