// 워크트리 슬롯의 순수 로직 (scripts/worktree.mjs 가 쓴다). 파일·프로세스·DB 를 건드리지 않아
// vitest 로 검증한다 (apps/web/test/worktree/worktree-lib.test.ts).
//
//   슬롯 0 = 메인 체크아웃: web :3001, DB seedbook / seedbook_test (기존 그대로)
//   슬롯 N = 링크된 워크트리 (1..9): web :3001+10N, 같은 dev postgres 안 DB seedbook_sN / seedbook_sN_test

import { sep } from "node:path";

/** 워크트리 루트의 슬롯 파일 (gitignore). 내용은 `SEEDBOOK_SLOT=N` */
export const SLOT_FILE = ".worktree-slot";
export const MAX_SLOT = 9;
export const BASE_WEB_PORT = 3001;
export const PG_HOST = "127.0.0.1";
export const PG_PORT = 5432;
/** docker-compose.dev.yml 의 기본 계정 */
export const DEFAULT_PG_USER = "seedbook";
export const DEFAULT_PG_PASSWORD = "seedbook";

const SLOT_DATABASE = /^seedbook_s(\d+)(_test)?$/;

/** @param {number} slot */
export function webPort(slot) {
  return BASE_WEB_PORT + 10 * slot;
}

/** @param {number} slot */
export function slotDatabases(slot) {
  const dev = slot === 0 ? "seedbook" : `seedbook_s${slot}`;
  return { dev, test: `${dev}_test` };
}

/**
 * @param {string} dbName
 * @param {{ user?: string, password?: string }} [credentials]
 */
export function databaseUrl(dbName, credentials = {}) {
  const user = encodeURIComponent(credentials.user ?? DEFAULT_PG_USER);
  const password = encodeURIComponent(credentials.password ?? DEFAULT_PG_PASSWORD);
  return `postgresql://${user}:${password}@${PG_HOST}:${PG_PORT}/${dbName}`;
}

/**
 * 슬롯 파일 내용에서 슬롯 번호. 없거나 범위 밖이면 null
 * @param {string} text
 * @returns {number | null}
 */
export function parseSlotFile(text) {
  const match = text.match(/^SEEDBOOK_SLOT=(\d+)\s*$/m);
  if (!match) return null;
  const slot = Number(match[1]);
  return slot >= 1 && slot <= MAX_SLOT ? slot : null;
}

/** @param {number} slot */
export function formatSlotFile(slot) {
  const db = slotDatabases(slot);
  return [
    "# scripts/worktree.mjs 가 배정한 워크트리 슬롯 (gitignore). 반납은 `pnpm wt:down`",
    `# web http://localhost:${webPort(slot)} / DB ${db.dev}, ${db.test}`,
    `SEEDBOOK_SLOT=${slot}`,
    "",
  ].join("\n");
}

/**
 * 비어 있는 가장 작은 슬롯. 다른 워크트리가 쥔 슬롯과 web 포트가 이미 쓰이는 슬롯은 건너뛴다
 * @param {{ used: Set<number>, portFree: (port: number) => boolean }} options
 * @returns {number | null}
 */
export function pickSlot({ used, portFree }) {
  for (let slot = 1; slot <= MAX_SLOT; slot++) {
    if (!used.has(slot) && portFree(webPort(slot))) return slot;
  }
  return null;
}

/**
 * dev 서버·DB 스크립트에 줄 환경변수. `env` 에 이미 있는 값은 덮어쓰지 않는다 (반환값에서 뺀다).
 * 슬롯 0 은 포트만 준다 — DB 는 지금처럼 `.env.local` 과 테스트 기본값을 쓴다.
 * @param {number} slot
 * @param {Record<string, string | undefined>} env
 * @returns {Record<string, string>}
 */
export function slotEnv(slot, env) {
  const port = webPort(slot);
  /** @type {Record<string, string>} */
  const wanted = { SEEDBOOK_SLOT: String(slot), PORT: String(port) };
  if (slot !== 0) {
    const credentials = { user: env.POSTGRES_USER, password: env.POSTGRES_PASSWORD };
    const db = slotDatabases(slot);
    wanted.DATABASE_URL = databaseUrl(db.dev, credentials);
    wanted.TEST_DATABASE_URL = databaseUrl(db.test, credentials);
    wanted.BETTER_AUTH_URL = `http://localhost:${port}`;
  }
  return Object.fromEntries(Object.entries(wanted).filter(([key]) => env[key] === undefined));
}

/**
 * `git worktree list --porcelain` → 워크트리 경로. 첫 항목이 메인 체크아웃이다
 * @param {string} porcelain
 */
export function parseWorktreeList(porcelain) {
  return porcelain
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length));
}

/**
 * 어떤 살아 있는 워크트리도 쥐고 있지 않은 슬롯 DB (`seedbook_sN`, `seedbook_sN_test`).
 * 메인 DB (`seedbook`, `seedbook_test`) 와 다른 이름은 대상이 아니다
 * @param {string[]} dbNames
 * @param {Set<number>} claimedSlots
 */
export function orphanSlotDatabases(dbNames, claimedSlots) {
  return dbNames
    .filter((name) => {
      const match = name.match(SLOT_DATABASE);
      return match !== null && !claimedSlots.has(Number(match[1]));
    })
    .sort();
}

/**
 * @param {string} path
 * @param {string} dir
 */
export function isUnder(path, dir) {
  return path === dir || path.startsWith(dir + sep);
}

/**
 * 프로세스 cwd 가 지워진 워크트리 안인가. 대상은 둘뿐이다:
 * hwt 위치(`base` = ~/.herdr/worktrees/<repo>) 아래이면서 그 워크트리 루트가 없어진 것, 또는
 * git 이 아직 기억하지만 디렉터리가 없어진(prunable) 워크트리 경로 아래. 메인 체크아웃·살아 있는 워크트리·다른 곳은 제외
 * @param {string} cwd
 * @param {{ base: string, goneWorktrees: string[], exists: (path: string) => boolean }} context
 */
export function isOrphanCwd(cwd, { base, goneWorktrees, exists }) {
  if (exists(cwd)) return false;
  if (goneWorktrees.some((dir) => isUnder(cwd, dir))) return true;
  if (!cwd.startsWith(base + sep)) return false;
  const root = base + sep + cwd.slice(base.length + 1).split(sep)[0];
  return !exists(root);
}

/** 에이전트 (claude, codex) 와 그 MCP 서버 (`@playwright/mcp` 등) */
const AGENT_ARGS = /(^|[\s/])(claude|codex)(\s|$)|(^|[\s/@_-])mcp([\s/@_-]|$)/;

/**
 * dev 서버를 정리할 때 건드리지 않을 프로세스인가 — 같은 워크트리를 cwd 로 쥔 에이전트와 그 MCP 서버
 * @param {string} args
 */
export function isAgentProcess(args) {
  return AGENT_ARGS.test(args);
}

/**
 * 메인 체크아웃에서 새 워크트리로 복사할 로컬 환경 파일인가 (`.env`, `.env.local`, `.env.*.local`).
 * `.env.example` 은 git 이 추적하므로 따로 복사하지 않아도 있다
 * @param {string} name
 */
export function isLocalEnvFile(name) {
  return name === ".env" || /^\.env(\.[\w-]+)?\.local$/.test(name);
}
