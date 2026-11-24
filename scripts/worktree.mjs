#!/usr/bin/env node
// 워크트리 병렬 개발용 슬롯. 워크트리마다 슬롯 번호 N 하나로 web 포트와 DB 를 나눈다.
//   슬롯 0 = 메인 체크아웃: web :4001, DB seedbook / seedbook_test (기존 그대로)
//   슬롯 N = 링크된 워크트리 (1..9): web :4001+10N, 같은 dev postgres 컨테이너 안 DB seedbook_sN / seedbook_sN_test
// 슬롯은 워크트리 루트의 .worktree-slot (gitignore) 에 `SEEDBOOK_SLOT=N` 으로 둔다. 순수 로직은 worktree-lib.mjs.
//
// 사용:
//   node scripts/worktree.mjs env <web|test-db> '<command>'  # apps/web 의 dev·test:db 가 쓰는 래퍼
//   pnpm db:seed:reset      슬롯 DB 의 dev 사용자를 시나리오로 되돌린다 (슬롯 0 은 기존처럼 crawler 컨테이너에서)
//   pnpm wt:info            이 워크트리의 슬롯·URL·DB (없으면 배정)
//   pnpm wt:down            이 워크트리의 dev 서버를 끄고 슬롯 DB 2개를 지운 뒤 슬롯 반납
//   pnpm wt:gc [--dry-run]  살아 있는 워크트리가 쥐지 않은 seedbook_s* DB 와, 지워진 워크트리 경로를
//                           cwd 로 쥔 node 프로세스를 정리 (메인 세션이 hwt rm 뒤 메인 체크아웃에서)
import { execFileSync, spawn } from "node:child_process";
import {
  closeSync,
  copyFileSync,
  existsSync,
  lstatSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  databaseUrl,
  formatSlotFile,
  hasKakaoRedirect,
  isAgentProcess,
  isLocalEnvFile,
  isOrphanCwd,
  isUnder,
  MAX_SLOT,
  orphanSlotDatabases,
  parseSlotFile,
  parseWorktreeList,
  pickSlot,
  SLOT_FILE,
  slotDatabases,
  slotEnv,
  webPort,
} from "./worktree-lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const log = (message) => console.log(`[worktree] ${message}`);
const warn = (message) => console.warn(`[worktree] ${message}`);

// ---- git ----

function git(...args) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function isLinkedWorktree() {
  try {
    return (
      resolve(ROOT, git("rev-parse", "--git-dir")) !==
      resolve(ROOT, git("rev-parse", "--git-common-dir"))
    );
  } catch {
    return false; // git 이 없는 곳 (도커 빌드 등) 은 메인으로 본다
  }
}

/** 모든 워크트리 경로. 첫 항목이 메인 체크아웃이다 */
function worktreePaths() {
  return parseWorktreeList(git("worktree", "list", "--porcelain"));
}

function mainCheckout() {
  return worktreePaths()[0] ?? ROOT;
}

// ---- 슬롯 ----

function readSlot(dir) {
  const file = join(dir, SLOT_FILE);
  return existsSync(file) ? parseSlotFile(readFileSync(file, "utf8")) : null;
}

/** 살아 있는 링크된 워크트리들이 쥔 슬롯. `except` 워크트리는 뺀다 */
function claimedSlots(except = null) {
  return new Set(
    worktreePaths()
      .slice(1)
      .filter((dir) => dir !== except && existsSync(dir))
      .map(readSlot)
      .filter((slot) => slot !== null)
  );
}

function canListen(port, host) {
  return new Promise((done) => {
    const server = createServer();
    server.once("error", () => done(false));
    server.listen({ port, host, exclusive: true }, () => server.close(() => done(true)));
  });
}

async function freePorts() {
  const free = new Set();
  for (let slot = 1; slot <= MAX_SLOT; slot++) {
    const port = webPort(slot);
    if ((await canListen(port, "127.0.0.1")) && (await canListen(port, "0.0.0.0"))) free.add(port);
  }
  return free;
}

/** 잠금을 이보다 오래 쥐고 있으면 죽은 프로세스가 남긴 것으로 보고 치운다 */
const LOCK_STALE_MS = 30_000;
const LOCK_WAIT_MS = 60_000;

/**
 * 슬롯 배정을 모든 워크트리에서 한 번에 하나씩만 한다. 잠금 파일은 공유 git 디렉터리에 둔다 —
 * 같은 워크트리에서 dev 와 test:db 를 동시에 띄우거나 두 워크트리가 동시에 배정할 때 같은 슬롯을 고르지 않게
 */
async function withSlotLock(fn) {
  const lock = join(resolve(ROOT, git("rev-parse", "--git-common-dir")), "seedbook-slot.lock");
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      closeSync(openSync(lock, "wx"));
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      try {
        if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) {
          rmSync(lock, { force: true });
          continue;
        }
      } catch {
        continue; // 그사이 풀렸다
      }
      if (Date.now() > deadline) throw new Error(`슬롯 잠금을 얻지 못했다: ${lock}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  try {
    return await fn();
  } finally {
    rmSync(lock, { force: true });
  }
}

/** SEEDBOOK_SLOT 환경변수 → 슬롯 파일 → (링크된 워크트리면) 새로 배정 → 메인 체크아웃이면 0 */
async function ensureSlot() {
  if (process.env.SEEDBOOK_SLOT !== undefined) return Number(process.env.SEEDBOOK_SLOT);
  const slot = readSlot(ROOT);
  if (slot !== null) return slot;
  if (!isLinkedWorktree()) return 0;
  // 잠금을 기다리는 동안 다른 프로세스가 배정했으면 그 슬롯을 쓴다
  return withSlotLock(async () => readSlot(ROOT) ?? (await assignSlot()));
}

async function assignSlot() {
  // 지워진 워크트리가 남긴 슬롯 DB 를 먼저 치운다. 안 그러면 새 워크트리가 옛 브랜치 DB 를 이어받는다
  await gcDatabases({ quiet: true });
  const free = await freePorts();
  const slot = pickSlot({ used: claimedSlots(ROOT), portFree: (port) => free.has(port) });
  if (slot === null) {
    throw new Error(`빈 슬롯이 없다 (1..${MAX_SLOT}). 안 쓰는 워크트리를 정리한다 (pnpm wt:down)`);
  }
  writeFileSync(join(ROOT, SLOT_FILE), formatSlotFile(slot));
  copyLocalEnvFiles(mainCheckout());
  log(`슬롯 ${slot} 배정: web :${webPort(slot)}, DB ${slotDatabases(slot).dev}`);
  return slot;
}

/** 루트·apps/*·packages/* 의 로컬 환경 파일 디렉터리 (메인 체크아웃 기준 상대 경로) */
function envFileDirs(main) {
  const dirs = ["."];
  for (const group of ["apps", "packages"]) {
    const groupDir = join(main, group);
    if (!existsSync(groupDir)) continue;
    for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
      if (entry.isDirectory()) dirs.push(join(group, entry.name));
    }
  }
  return dirs;
}

function lexists(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * 새 워크트리에는 gitignore 된 로컬 환경 파일이 없으므로 메인 체크아웃에서 복사한다 (이미 있으면 그대로).
 * apps/web·packages/database 의 `.env.local` 은 루트 `.env.local` 을 가리키는 상대 심링크라 심링크로 다시 만든다
 */
function copyLocalEnvFiles(main) {
  if (resolve(main) === ROOT) return;
  for (const dir of envFileDirs(main)) {
    const destDir = join(ROOT, dir);
    if (!existsSync(destDir)) continue;
    for (const name of readdirSync(join(main, dir)).filter(isLocalEnvFile)) {
      const from = join(main, dir, name);
      const to = join(destDir, name);
      if (lexists(to)) continue;
      const stat = lstatSync(from);
      if (stat.isSymbolicLink() && !isAbsolute(readlinkSync(from))) {
        symlinkSync(readlinkSync(from), to);
      } else if (stat.isFile() || stat.isSymbolicLink()) {
        copyFileSync(from, to);
      } else {
        continue;
      }
      log(`${join(dir, name)} 를 메인 체크아웃에서 복사했다`);
    }
  }
}

// ---- postgres ----

function pgCredentials(env = process.env) {
  return { user: env.POSTGRES_USER, password: env.POSTGRES_PASSWORD };
}

/** postgres 클라이언트는 packages/database 의 의존성을 빌려 쓴다 (루트에는 의존성이 없다) */
async function loadPostgres() {
  const require = createRequire(join(ROOT, "packages/database/package.json"));
  const module = await import(pathToFileURL(require.resolve("postgres")).href);
  return module.default;
}

/** 관리용 연결 (postgres DB). 연결하지 못하면 throw */
async function withAdmin(fn) {
  const postgres = await loadPostgres();
  const sql = postgres(databaseUrl("postgres", pgCredentials()), {
    max: 1,
    connect_timeout: 3,
    onnotice: () => {},
  });
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 1 });
  }
}

async function pgReachable() {
  try {
    await withAdmin((sql) => sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

/** dev postgres 가 안 떠 있으면 `pnpm db:dev:up` 과 같은 명령으로 띄운다 (메인 체크아웃의 compose 파일로) */
async function ensurePostgres() {
  if (await pgReachable()) return;
  const main = mainCheckout();
  log("dev postgres 가 응답하지 않아 띄운다 (pnpm db:dev:up)");
  try {
    execFileSync(
      "docker",
      ["compose", "-f", join(main, "docker-compose.dev.yml"), "up", "-d", "--wait", "postgres"],
      { cwd: main, stdio: "inherit" }
    );
  } catch {
    throw new Error(
      "dev postgres 를 띄우지 못했다. Docker 를 켜고 메인 체크아웃에서 `pnpm db:dev:up`"
    );
  }
  if (!(await pgReachable())) throw new Error("dev postgres (127.0.0.1:5432) 에 연결하지 못했다");
}

async function listDatabases() {
  return withAdmin(async (sql) =>
    (await sql`SELECT datname FROM pg_database`).map((row) => row.datname)
  );
}

async function dropDatabases(names) {
  await withAdmin(async (sql) => {
    for (const name of names) await sql.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  });
}

function runDatabaseScript(script, env) {
  execFileSync("pnpm", ["--filter", "@seedbook/database", script], {
    cwd: ROOT,
    stdio: "inherit",
    env,
  });
}

/** 종목 시드가 비어 있으면 (새 DB, 또는 지난번 시드가 중간에 실패) 다시 채운다 */
async function stocksMissing(url) {
  const postgres = await loadPostgres();
  const sql = postgres(url, { max: 1, connect_timeout: 3, onnotice: () => {} });
  try {
    const [row] = await sql`SELECT count(*)::int AS n FROM seedbook."Stock"`;
    return row.n === 0;
  } finally {
    await sql.end({ timeout: 1 });
  }
}

/**
 * 슬롯 DB 를 준비한다: 없으면 만들고, drizzle 마이그레이션을 적용하고 (매번 — 브랜치가 바뀌었을 수 있다),
 * 종목이 비어 있으면 fixture 를 재생한다 (NODE_ENV=development 라 dev 사용자·시나리오 데이터 포함)
 */
async function prepareSlotDatabase(slot, env) {
  await ensurePostgres();
  const { dev } = slotDatabases(slot);
  const created = await withAdmin(async (sql) => {
    const [exists] = await sql`SELECT 1 FROM pg_database WHERE datname = ${dev}`;
    if (exists) return false;
    try {
      await sql.unsafe(`CREATE DATABASE "${dev}"`);
    } catch (error) {
      if (error.code !== "42P04") throw error; // 동시에 다른 프로세스가 만들었다
    }
    return true;
  });
  if (created) log(`DB ${dev} 를 만들었다`);
  runDatabaseScript("db:migrate", env);
  if (await stocksMissing(env.DATABASE_URL)) {
    log(`DB ${dev} 에 시드를 넣는다 (fixture + dev 사용자 시나리오)`);
    runDatabaseScript("db:seed", { ...env, NODE_ENV: "development" });
  }
}

// ---- 명령 실행 ----

const KINDS = ["web", "test-db"];

/**
 * 슬롯 환경변수. 이미 설정된 값은 덮어쓰지 않는다. 슬롯 DB 를 준비할지는 DATABASE_URL 을 슬롯이 정했는지로 정한다
 * (밖에서 DATABASE_URL 을 줬으면 그 DB 를 그대로 쓰고 건드리지 않는다)
 */
function envForSlot(slot) {
  const injected = slotEnv(slot, process.env);
  if (slot !== 0 && !injected.DATABASE_URL) {
    warn(`DATABASE_URL 이 이미 설정돼 있어 슬롯 DB (${slotDatabases(slot).dev}) 대신 그것을 쓴다`);
  }
  return { injected, env: { ...process.env, ...injected } };
}

// 래퍼가 SIGKILL 로 죽으면 신호를 넘길 수 없고, 자식 그룹은 별도 그룹이라 고아로 남는다. 그래서 작은 감시
// 프로세스를 따로 둔다. 감시는 래퍼와 파이프(감시의 stdin) 하나만 잇고, 래퍼가 어떻게 끝나든 커널이 파이프를
// 닫으면 EOF 를 받아 자식 그룹을 SIGTERM → 유예 뒤 SIGKILL 하고 끝난다 (~/project/teum/scripts/worktree.mjs 와 같다)
const TERM_GRACE_MS = 5_000;
const WATCHDOG = `const g=-+process.argv[1],k=s=>{try{process.kill(g,s);return 1}catch{}};process.stdin.on("error",()=>{}).on("close",()=>{if(!k("SIGTERM"))process.exit();const t=Date.now(),i=setInterval(()=>{if(!k(0))process.exit();if(Date.now()-t>${TERM_GRACE_MS * 2}){k("SIGKILL");process.exit()}},200)}).resume()`;

function startWatchdog(pgid) {
  const watchdog = spawn(process.execPath, ["-e", WATCHDOG, String(pgid)], {
    stdio: ["pipe", "ignore", "ignore"],
    detached: true,
  });
  watchdog.on("error", () => {});
  watchdog.stdin.on("error", () => {});
  watchdog.unref();
}

async function run(kind, command) {
  if (!KINDS.includes(kind)) throw new Error(`종류는 ${KINDS.join("|")} 중 하나다: ${kind}`);
  if (!command) throw new Error("실행할 명령이 없다");
  const slot = await ensureSlot();
  const { injected, env } = envForSlot(slot);
  if (slot !== 0) {
    const db = slotDatabases(slot);
    log(
      kind === "web"
        ? `slot ${slot}: web :${env.PORT}, DB ${db.dev}`
        : `slot ${slot}: test DB ${db.test}`
    );
    if (kind === "web" && injected.DATABASE_URL) await prepareSlotDatabase(slot, env);
    if (kind === "test-db") await ensurePostgres();
  }
  // 자식(sh -c '…')을 자기 프로세스 그룹으로 띄우고 신호를 그룹 전체에 보낸다 — sh 에만 보내면 손자(next dev)가
  // 고아로 남는다. 별도 그룹은 tty 를 읽으면 멈추므로(SIGTTIN) stdin 은 넘기지 않는다
  const child = spawn(command, {
    shell: true,
    stdio: ["ignore", "inherit", "inherit"],
    env,
    detached: true,
  });
  startWatchdog(child.pid);
  const killGroup = (signal) => {
    try {
      process.kill(-child.pid, signal);
    } catch {} // 이미 다 끝났다
  };
  // 신호를 넘긴 뒤 자식이 끝나기를 기다리고, 그래도 안 끝나면 (첫 신호 기준) 그룹을 SIGKILL 한다
  let forceKillArmed = false;
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      killGroup(signal);
      if (forceKillArmed) return;
      forceKillArmed = true;
      setTimeout(() => killGroup("SIGKILL"), TERM_GRACE_MS * 2);
    });
  }
  process.on("exit", () => killGroup("SIGTERM"));
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

/** 슬롯 0 은 기존처럼 crawler 이미지로 일회용 컨테이너를 띄워 메인 DB 를, 슬롯 N 은 호스트 tsx 로 슬롯 DB 를 리셋 */
async function dbReset() {
  const slot = await ensureSlot();
  if (slot === 0) {
    execFileSync(
      "docker",
      [
        "compose",
        "-f",
        "docker-compose.dev.yml",
        "run",
        "--rm",
        "--no-deps",
        "--entrypoint",
        "./node_modules/.bin/tsx",
        "-w",
        "/app/packages/database",
        "stock-crawler",
        "scripts/reset-dev-user.ts",
      ],
      { cwd: ROOT, stdio: "inherit" }
    );
    return;
  }
  const { injected, env } = envForSlot(slot);
  if (injected.DATABASE_URL) await prepareSlotDatabase(slot, env);
  log(`slot ${slot}: DB ${slotDatabases(slot).dev} 의 dev 사용자를 시나리오로 되돌린다`);
  runDatabaseScript("db:seed:reset", env);
}

async function info() {
  const slot = await ensureSlot();
  const db = slotDatabases(slot);
  const port = webPort(slot);
  console.log(`slot ${slot}${slot === 0 ? " (메인 체크아웃)" : ""}  ${ROOT}`);
  console.log(`  web      http://localhost:${port}  (pnpm dev)`);
  console.log(`  DB       ${db.dev}  @127.0.0.1:5432${slot === 0 ? " (.env.local)" : ""}`);
  console.log(`  test DB  ${db.test}  (pnpm --filter @seedbook/web test:db)`);
  if (slot !== 0) {
    console.log(
      hasKakaoRedirect(slot)
        ? `  로그인    카카오 로그인 (Redirect URI :${port} 등록됨) 또는 로그인 화면의 "개발용 빠른 로그인 (카카오 우회)" (dev-login)`
        : `  로그인    카카오 Redirect URI 에 :${port} 가 없어 로그인 화면의 "개발용 빠른 로그인 (카카오 우회)" (dev-login) 을 쓴다`
    );
  }
}

// ---- 워크트리에 남은 dev 서버 프로세스 ----
// 워크트리를 지울 때 그 안에서 띄운 dev 서버(next dev …)가 터미널 밖(에이전트 백그라운드 Bash 등)에서 떠 있으면
// 부모를 잃고 launchd 밑에 남는다. 작업 디렉터리(cwd)로 찾아 끈다

/** 끌 대상 명령 이름(lsof 의 c 필드). next-server·tsx 도 명령 이름은 node 다. 셸·에이전트·MCP 서버는 건드리지 않는다 */
const DEV_COMMANDS = new Set(["node", "esbuild"]);

/** 모든 프로세스의 { pid, command, cwd }. lsof 가 없거나 실패하면 빈 목록 */
function processCwds() {
  let out;
  try {
    out = execFileSync("lsof", ["-a", "-d", "cwd", "-Fpcn"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    out = error.stdout ?? ""; // 권한이 없는 프로세스가 있으면 종료 코드 1 이지만 나머지는 나온다
  }
  const procs = [];
  let current = null;
  for (const line of out.split("\n")) {
    const tag = line[0];
    const value = line.slice(1);
    if (tag === "p") {
      current = { pid: Number(value), command: "", cwd: "" };
      procs.push(current);
    } else if (current && tag === "c") current.command = value;
    else if (current && tag === "n") current.cwd = value;
  }
  return procs.filter((p) => p.cwd);
}

/** pid → { ppid, args } */
function processTable() {
  const table = new Map();
  const out = execFileSync("ps", ["-axww", "-o", "pid=,ppid=,args="], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  for (const line of out.split("\n")) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s?(.*)$/);
    if (match) table.set(Number(match[1]), { ppid: Number(match[2]), args: match[3] });
  }
  return table;
}

/** 자기 자신과 조상 (hwt rm → pnpm wt:down → 이 스크립트, 그걸 부른 에이전트 등) */
function selfAndAncestors(table) {
  const pids = new Set();
  for (let pid = process.pid; pid > 1 && !pids.has(pid); pid = table.get(pid)?.ppid ?? 0) {
    pids.add(pid);
  }
  return pids;
}

function devProcesses(match) {
  const table = processTable();
  const skip = selfAndAncestors(table);
  return processCwds()
    .filter((p) => DEV_COMMANDS.has(basename(p.command)) && !skip.has(p.pid) && match(p.cwd))
    .map((p) => ({ ...p, args: table.get(p.pid)?.args ?? p.command }))
    .filter((p) => !isAgentProcess(p.args));
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

/** SIGTERM → 남으면 TERM_GRACE_MS 뒤 SIGKILL */
async function terminate(procs) {
  for (const p of procs) {
    try {
      process.kill(p.pid, "SIGTERM");
    } catch {}
  }
  const deadline = Date.now() + TERM_GRACE_MS;
  let left = procs.filter((p) => alive(p.pid));
  while (left.length && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
    left = left.filter((p) => alive(p.pid));
  }
  for (const p of left) {
    try {
      process.kill(p.pid, "SIGKILL");
    } catch {}
  }
  if (left.length) log(`SIGTERM 에 안 끝나 SIGKILL: ${left.map((p) => p.pid).join(", ")}`);
}

function describe(p) {
  const args = p.args.length > 160 ? `${p.args.slice(0, 157)}...` : p.args;
  return `  ${p.pid}  ${args}\n        cwd ${p.cwd}`;
}

async function stopWorktreeProcesses() {
  const root = realpathSync(ROOT);
  const procs = devProcesses((cwd) => isUnder(cwd, root));
  if (procs.length === 0) return;
  log(`이 워크트리에서 도는 프로세스를 끈다:\n${procs.map(describe).join("\n")}`);
  await terminate(procs);
}

/** hwt 가 워크트리를 두는 곳 (~/.herdr/worktrees/<repo>) */
function herdrWorktreeBase() {
  return join(homedir(), ".herdr", "worktrees", basename(mainCheckout()));
}

async function gcProcesses({ dryRun }) {
  let procs;
  try {
    const context = {
      base: herdrWorktreeBase(),
      goneWorktrees: worktreePaths()
        .slice(1)
        .filter((dir) => !existsSync(dir)),
      exists: existsSync,
    };
    procs = devProcesses((cwd) => isOrphanCwd(cwd, context));
  } catch (error) {
    warn(`남은 프로세스를 찾지 못했다: ${error.message}`);
    return;
  }
  if (procs.length === 0) {
    log("지워진 워크트리에 남은 프로세스가 없다");
    return;
  }
  const list = procs.map(describe).join("\n");
  if (dryRun) {
    log(`(dry-run) 지워진 워크트리에 남은 프로세스:\n${list}`);
    return;
  }
  log(`지워진 워크트리에 남은 프로세스를 끈다:\n${list}`);
  await terminate(procs);
}

/**
 * 살아 있는 링크된 워크트리가 슬롯 파일로 쥐고 있지 않은 seedbook_sN(_test) DB 를 지운다.
 * 메인 DB (seedbook, seedbook_test) 는 대상이 아니다. quiet: 슬롯 배정 때 — postgres 가 꺼져 있으면 조용히 넘어간다
 */
async function gcDatabases({ dryRun = false, quiet = false } = {}) {
  let names;
  try {
    names = orphanSlotDatabases(await listDatabases(), claimedSlots());
  } catch {
    if (!quiet)
      warn("dev postgres 에 연결하지 못해 슬롯 DB 정리를 건너뛴다 (pnpm db:dev:up 뒤 다시)");
    return;
  }
  if (names.length === 0) {
    if (!quiet) log("정리할 슬롯 DB 가 없다");
    return;
  }
  if (dryRun) {
    log(`(dry-run) 주인 없는 슬롯 DB: ${names.join(", ")}`);
    return;
  }
  await dropDatabases(names);
  log(`주인 없는 슬롯 DB 를 지웠다: ${names.join(", ")}`);
}

async function gc({ dryRun }) {
  await gcProcesses({ dryRun });
  await gcDatabases({ dryRun });
}

async function down() {
  if (!isLinkedWorktree()) {
    log("메인 체크아웃(슬롯 0)의 dev 서버와 DB 는 건드리지 않는다");
    return;
  }
  await stopWorktreeProcesses();
  const slot = readSlot(ROOT);
  if (slot === null) {
    log("배정된 슬롯이 없다. 지울 DB 가 없다");
    return;
  }
  const db = slotDatabases(slot);
  try {
    await dropDatabases([db.dev, db.test]);
    log(`DB ${db.dev}, ${db.test} 를 지웠다`);
  } catch (error) {
    // 슬롯 파일을 지우면 아무도 쥐지 않은 DB 가 되어 다음 wt:gc 가 치운다
    warn(`DB 를 지우지 못했다 (${error.message}). 나중에 메인 체크아웃에서 pnpm wt:gc`);
  }
  rmSync(join(ROOT, SLOT_FILE));
  log(`슬롯 ${slot} 반납`);
}

const [command, ...rest] = process.argv.slice(2);
try {
  if (command === "env") await run(rest[0], rest.slice(1).join(" "));
  else if (command === "db-reset") await dbReset();
  else if (command === "info") await info();
  else if (command === "down") await down();
  else if (command === "gc") await gc({ dryRun: rest.includes("--dry-run") });
  else {
    console.error(
      "usage: worktree.mjs <env <web|test-db> <command> | db-reset | info | down | gc [--dry-run]>"
    );
    process.exit(2);
  }
} catch (error) {
  console.error(`[worktree] ${error.message}`);
  process.exit(1);
}
