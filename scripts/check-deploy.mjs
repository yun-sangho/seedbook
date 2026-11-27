#!/usr/bin/env node
// 머지 큐 배포 확인 — `.hwt.json` mergeQueue.verify 가 머지 뒤 메인 체크아웃에서 부른다.
// 머지 커밋(첫 인자, verify 는 "$HWT_MQ_SHA" 를 넘긴다)의 "Build & Deploy" run 이 끝날 때까지 보고,
// 성공하면 사이트가 200 인지 확인한다. 실패하면 실패한 job·step 을 출력하고 exit 1.
// 빌드 대상이 없는 변경(문서 등)도 run 이 성공하면 같은 확인을 한다.
//
//   node scripts/check-deploy.mjs <sha>

import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { failedStepNames, findDeployRun, runVerdict } from "./check-deploy-lib.mjs";

const SITE_URL = "https://seedbook.boogie.ing";
const POLL_MS = 20_000;
// run 이 아직 안 생겼을 때 기다리는 시간 (push 직후 몇 초~수십 초 걸린다)
const MISSING_TIMEOUT_MS = 5 * 60_000;
// hwt 의 verifyTimeout(기본 1800초)보다 먼저 끝나 이유를 남긴다
const TOTAL_TIMEOUT_MS = 28 * 60_000;
const SITE_ATTEMPTS = 5;
const SITE_RETRY_MS = 10_000;
const FAILED_STEP_LINES = 10;

const sha = process.argv[2];
if (!sha) {
  console.error("usage: node scripts/check-deploy.mjs <merge commit sha>");
  process.exit(2);
}

const gh = (args) => execFileSync("gh", args, { encoding: "utf8" });

function listRuns() {
  const out = gh([
    "run",
    "list",
    "--workflow",
    "deploy.yml",
    "--commit",
    sha,
    "--json",
    "databaseId,headSha,event,status,conclusion,createdAt,url",
  ]);
  return JSON.parse(out);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function waitForRun() {
  const started = Date.now();
  while (true) {
    const run = findDeployRun(listRuns(), sha);
    const verdict = runVerdict(run);
    if (verdict === "success" || verdict === "failure") return { run, verdict };
    const waited = Date.now() - started;
    if (verdict === "missing" && waited > MISSING_TIMEOUT_MS) {
      fail(`no "Build & Deploy" push run for ${sha} after 5 minutes`);
    }
    if (waited > TOTAL_TIMEOUT_MS) {
      fail(`"Build & Deploy" run ${run?.url} still ${run?.status} after 28 minutes`);
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

const { run, verdict } = await waitForRun();
if (verdict === "failure") {
  fail(
    `"Build & Deploy" ${run.conclusion}: ${run.url}\n` +
      `${failedSteps(run)}\nlog: gh run view ${run.databaseId} --log-failed`
  );
}

let status;
for (let attempt = 1; attempt <= SITE_ATTEMPTS; attempt++) {
  status = await siteStatus();
  if (status === 200) {
    console.log(`deploy ok: ${run.url}, ${SITE_URL} 200`);
    process.exit(0);
  }
  if (attempt < SITE_ATTEMPTS) await sleep(SITE_RETRY_MS);
}
fail(`"Build & Deploy" succeeded (${run.url}) but ${SITE_URL} returned ${status}`);
