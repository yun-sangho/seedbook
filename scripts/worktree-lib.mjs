// 워크트리 슬롯의 순수 로직 (scripts/worktree.mjs 가 쓴다). 파일·프로세스·DB 를 건드리지 않아
// vitest 로 검증한다 (apps/web/test/worktree/worktree-lib.test.ts).
//
//   슬롯 0 = 메인 체크아웃: web :4001, DB seedbook / seedbook_test (기존 그대로)
//   슬롯 N = 링크된 워크트리 (1..9): web :4001+10N (3000번대는 다른 프로젝트(teum)의 슬롯 포트와 겹친다), 같은 dev postgres 안 DB seedbook_sN / seedbook_sN_test

import { sep } from "node:path";

/** 워크트리 루트의 슬롯 파일 (gitignore). 내용은 `SEEDBOOK_SLOT=N` */
export const SLOT_FILE = ".worktree-slot";
export const MAX_SLOT = 9;
/** 슬롯 0 (메인 체크아웃). 슬롯 N 은 여기에 +10N (4011..4091) */
export const MAIN_WEB_PORT = 4001;
export const PG_HOST = "127.0.0.1";
export const PG_PORT = 5432;
/** docker-compose.dev.yml 의 기본 계정 */
export const DEFAULT_PG_USER = "seedbook";
export const DEFAULT_PG_PASSWORD = "seedbook";

const SLOT_DATABASE = /^seedbook_s(\d+)(_test)?$/;

/** @param {number} slot */
export function webPort(slot) {
  return MAIN_WEB_PORT + 10 * slot;
}

/** 카카오 콘솔에 Redirect URI 를 등록한 마지막 슬롯 (0..3 = 4001·4011·4021·4031) */
const LAST_KAKAO_SLOT = 3;

/**
 * 이 슬롯의 포트가 카카오 콘솔에 Redirect URI 로 등록돼 있는가
 * @param {number} slot
 */
export function hasKakaoRedirect(slot) {
  return slot <= LAST_KAKAO_SLOT;
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

/**
 * 포트를 듣는 프로세스를 이 체크아웃 것과 남의 것으로 나눈다. cwd 를 품은 가장 안쪽 워크트리가 이 체크아웃일 때만
 * 자기 것이다 (메인 체크아웃 안에 놓인 다른 워크트리는 남의 것). cwd 를 모르면 남의 것으로 본다
 * @template {{ cwd: string | null }} T
 * @param {T[]} listeners
 * @param {{ root: string, worktrees: string[] }} context 모두 realpath
 * @returns {{ own: T[], foreign: T[] }}
 */
export function partitionListeners(listeners, { root, worktrees }) {
  const nested = worktrees.filter((dir) => dir !== root && isUnder(dir, root));
  /** @param {T} listener */
  const isOwn = ({ cwd }) =>
    cwd !== null && isUnder(cwd, root) && !nested.some((dir) => isUnder(cwd, dir));
  return {
    own: listeners.filter(isOwn),
    foreign: listeners.filter((listener) => !isOwn(listener)),
  };
}

/** `pnpm dev` 래퍼 자신. 같은 문자열을 인자로 품은 `sh -c node …worktree.mjs` 는 아니다 */
const DEV_WRAPPER_ARGS = /^(\S*\/)?node\s+\S*scripts\/worktree\.mjs\s+env\s+web(\s|$)/;

/** 래퍼 감시 프로세스의 명령줄에 넣는 표시 */
export const WATCHDOG_MARKER = "/*seedbook-dev-watchdog*/";

/**
 * 듣는 프로세스를 끄려면 함께 끝내야 할 pid. `pnpm dev` 래퍼 아래에 있으면 래퍼와 그 자손 전부, 아니면 듣는
 * 프로세스와 그 자손. 래퍼 위(pnpm·셸·에이전트)와 `isOwn` 이 아닌 프로세스는 넣지 않는다.
 * 감시 프로세스도 뺀다 — 래퍼가 SIGKILL 되면 남은 자식 그룹을 치우고 스스로 끝난다
 * @param {number[]} listenerPids
 * @param {Map<number, { ppid: number, args: string }>} table
 * @param {{ isOwn: (pid: number) => boolean }} options
 * @returns {number[]}
 */
export function stopTargets(listenerPids, table, { isOwn }) {
  /** @param {number} listener */
  const findRoot = (listener) => {
    const seen = new Set();
    for (let pid = listener; pid > 1 && !seen.has(pid); pid = table.get(pid)?.ppid ?? 0) {
      seen.add(pid);
      if (DEV_WRAPPER_ARGS.test(table.get(pid)?.args ?? "") && isOwn(pid)) return pid;
    }
    return listener;
  };
  const tree = new Set(listenerPids.map(findRoot));
  // Set 은 도는 중에 넣은 값도 이어서 돈다 — 자손을 끝까지 따라간다
  for (const parent of tree) {
    for (const [pid, { ppid }] of table) if (ppid === parent) tree.add(pid);
  }
  return [...tree].filter((pid) => isOwn(pid) && !table.get(pid)?.args.includes(WATCHDOG_MARKER));
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
