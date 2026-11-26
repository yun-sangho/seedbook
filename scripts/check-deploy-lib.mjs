// 머지 큐 배포 확인(scripts/check-deploy.mjs)의 순수 로직. 테스트: apps/web/test/check-deploy/

/**
 * 머지 커밋의 "Build & Deploy" run 을 고른다. main push 로 시작된 run 만 보고
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
 * @param {{ status: string, conclusion: string } | null} run
 * @returns {"missing" | "pending" | "success" | "failure"}
 */
export function runVerdict(run) {
  if (!run) return "missing";
  if (run.status !== "completed") return "pending";
  return run.conclusion === "success" ? "success" : "failure";
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
