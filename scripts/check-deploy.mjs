#!/usr/bin/env node
// 머지 큐 배포 확인 — `.hwt.json` mergeQueue.verify 로 hwt 가 머지 뒤 메인 체크아웃에서 부른다.
// 머지 커밋(첫 인자, verify 는 "$HWT_MQ_SHA" 를 넘긴다)에서 바뀐 경로로 run 이 생겨야 하는 배포
// 워크플로(deploy-web.yml · deploy-crawler.yml, 경로 필터라 커밋마다 다르다)를 고르고, 그 run 들이
// 끝날 때까지 본다. 대기 중에 다음 push 로 취소된 run 은 그 뒤 run 의 결과를 따른다.
// 모두 성공하면(또는 배포할 것이 없으면) 사이트가 200 인지 확인한다.
// 실패하면 실패한 job·step 을 출력하고 exit 1.
//
//   node scripts/check-deploy.mjs <sha>

import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import {
  expectedWorkflows,
  failedStepNames,
  findDeployRun,
  runVerdict,
  successorRun,
} from "./check-deploy-lib.mjs";

const SITE_URL = "https://seedbook.boogie.ing";
const POLL_MS = 20_000;
// run 이 아직 안 생겼을 때 기다리는 시간 (push 직후 몇 초~수십 초 걸린다)
const MISSING_TIMEOUT_MS = 5 * 60_000;
// hwt 의 verifyTimeout(기본 1800초)보다 먼저 끝나 이유를 남긴다
const TOTAL_TIMEOUT_MS = 28 * 60_000;
const SITE_ATTEMPTS = 5;
const SITE_RETRY_MS = 10_000;
const FAILED_STEP_LINES = 10;
const RUN_FIELDS = "databaseId,headSha,event,status,conclusion,createdAt,url";

const sha = process.argv[2];
if (!sha) {
  console.error("usage: node scripts/check-deploy.mjs <merge commit sha>");
  process.exit(2);
}

const gh = (args) => execFileSync("gh", args, { encoding: "utf8" });

function fail(message) {
  console.error(message);
  process.exit(1);
}

function changedFiles() {
  const out = gh([
    "api",
    "--paginate",
    `repos/{owner}/{repo}/commits/${sha}?per_page=100`,
    "--jq",
    ".files[].filename",
  ]);
  return out.split("\n").filter(Boolean);
}

/** 이 워크플로의 최근 main push run 들 (머지 커밋 것과, 취소됐을 때 이어받은 뒤 run) */
function listRuns(workflow) {
  const out = gh([
    "run",
    "list",
    "--workflow",
    workflow,
    "--branch",
    "main",
    "--event",
    "push",
    "--limit",
    "30",
    "--json",
    RUN_FIELDS,
  ]);
  return JSON.parse(out);
}

/** 머지 커밋의 run, 취소됐으면 이어받은 run 을 따라간 최종 run 과 판정 */
function effectiveRun(workflow) {
  const runs = listRuns(workflow);
  let run = findDeployRun(runs, sha);
  let verdict = runVerdict(run);
  while (verdict === "cancelled") {
    const next = successorRun(runs, run);
    if (!next) return { run, verdict: "pending" }; // 이어받을 run 이 아직 안 생김
    run = next;
    verdict = runVerdict(run);
  }
  return { run, verdict };
}

async function waitForRuns(workflows) {
  const started = Date.now();
  while (true) {
    const results = workflows.map((workflow) => ({ workflow, ...effectiveRun(workflow) }));
    if (results.every((r) => r.verdict === "success" || r.verdict === "failure")) return results;
    const waited = Date.now() - started;
    const missing = results.filter((r) => r.verdict === "missing");
    if (missing.length > 0 && waited > MISSING_TIMEOUT_MS) {
      fail(
        `no push run of ${missing.map((r) => r.workflow).join(", ")} for ${sha} after 5 minutes`
      );
    }
    if (waited > TOTAL_TIMEOUT_MS) {
      const open = results.filter((r) => r.verdict !== "success" && r.verdict !== "failure");
      fail(
        `deploy runs still not finished after 28 minutes:\n` +
          open.map((r) => `- ${r.workflow}: ${r.run?.url ?? "(no run)"}`).join("\n")
      );
    }
    await sleep(POLL_MS);
  }
}

// hwt 는 실패 출력의 끝 몇 줄만 작업 세션에 넘긴다. --log-failed 끝부분은 컨테이너 정리 로그라
// 쓸모가 없으니, 실패한 job·step 이름을 적고 로그는 명령으로 남긴다.
function failedSteps(run) {
  try {
    const { jobs } = JSON.parse(gh(["run", "view", String(run.databaseId), "--json", "jobs"]));
    return failedStepNames(jobs)
      .slice(0, FAILED_STEP_LINES)
      .map((name) => `- ${name}`)
      .join("\n");
  } catch {
    return "(could not read the run's jobs)";
  }
}

async function siteStatus() {
  try {
    const res = await fetch(SITE_URL, { redirect: "manual" });
    return res.status;
  } catch (error) {
    return String(error);
  }
}

const workflows = expectedWorkflows(changedFiles());
let deployed = "nothing to deploy";
if (workflows.length > 0) {
  const results = await waitForRuns(workflows);
  const failed = results.filter((r) => r.verdict === "failure");
  if (failed.length > 0) {
    fail(
      failed
        .map(
          ({ workflow, run }) =>
            `${workflow} ${run.conclusion}: ${run.url}\n${failedSteps(run)}\n` +
            `log: gh run view ${run.databaseId} --log-failed`
        )
        .join("\n")
    );
  }
  deployed = results.map((r) => `${r.workflow} ${r.run.url}`).join(", ");
}

let status;
for (let attempt = 1; attempt <= SITE_ATTEMPTS; attempt++) {
  status = await siteStatus();
  if (status === 200) {
    console.log(`deploy ok: ${deployed}; ${SITE_URL} 200`);
    process.exit(0);
  }
  if (attempt < SITE_ATTEMPTS) await sleep(SITE_RETRY_MS);
}
fail(`deploy ok (${deployed}) but ${SITE_URL} returned ${status}`);
