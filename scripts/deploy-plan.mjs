#!/usr/bin/env node
// 배포 워크플로(deploy.yml)의 changes job — 이번 run 이 빌드할 이미지와 배포 여부를 정한다.
// 마지막으로 성공한 배포 run 의 커밋..지금 커밋 사이에 바뀐 경로로 고른다 (판단은 deploy-plan-lib.mjs).
// 수동 실행이거나, 기준 커밋이 없거나 조회에 실패하거나 지금 커밋의 조상이 아니면 전체 배포.
// 기준 커밋을 찾으려면 전체 히스토리(checkout fetch-depth: 0)와 GH_TOKEN(actions: read)이 필요하다.
//
// 결과는 $GITHUB_OUTPUT 의 services(JSON 배열)·deploy(true|false) 와 $GITHUB_STEP_SUMMARY 에 쓴다.

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { lastDeployedSha, planDeploy } from "./deploy-plan-lib.mjs";

const WORKFLOW_FILE = "deploy.yml";

const {
  GITHUB_EVENT_NAME,
  GITHUB_SHA,
  GITHUB_REF_NAME,
  GITHUB_REPOSITORY,
  GITHUB_OUTPUT,
  GITHUB_STEP_SUMMARY,
} = process.env;

const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" }).trim();

/** @returns {{ base: string | null, reason: string }} */
function findBase() {
  if (GITHUB_EVENT_NAME === "workflow_dispatch") {
    return { base: null, reason: "manual run: deploy everything" };
  }
  let runs;
  try {
    const out = run("gh", [
      "api",
      `repos/${GITHUB_REPOSITORY}/actions/workflows/${WORKFLOW_FILE}/runs?branch=${GITHUB_REF_NAME}&status=success&per_page=30`,
    ]);
    runs = JSON.parse(out).workflow_runs;
  } catch (error) {
    return {
      base: null,
      reason: `could not list deploy runs (${error.message.split("\n")[0]}): deploy everything`,
    };
  }
  const base = lastDeployedSha(runs, GITHUB_REF_NAME);
  if (!base) return { base: null, reason: "no successful deploy run: deploy everything" };
  try {
    run("git", ["merge-base", "--is-ancestor", base, GITHUB_SHA]);
  } catch {
    return {
      base: null,
      reason: `last deployed ${base} is not in the history of ${GITHUB_SHA}: deploy everything`,
    };
  }
  return { base, reason: `changes since last deployed ${base}` };
}

const { base, reason } = findBase();
const changedFiles = base
  ? run("git", ["diff", "--name-only", base, GITHUB_SHA]).split("\n").filter(Boolean)
  : null;
const { services, deploy } = planDeploy(changedFiles);

const summary = [
  `base: ${reason}`,
  ...(changedFiles ? [`changed files: ${changedFiles.length}`] : []),
  `build: ${JSON.stringify(services)} / deploy: ${deploy}`,
].join("\n");
console.log(summary);

if (GITHUB_OUTPUT) {
  appendFileSync(GITHUB_OUTPUT, `services=${JSON.stringify(services)}\ndeploy=${deploy}\n`);
}
if (GITHUB_STEP_SUMMARY) {
  appendFileSync(GITHUB_STEP_SUMMARY, `${summary.replaceAll("\n", "  \n")}\n`);
}
