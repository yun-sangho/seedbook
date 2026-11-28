# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
pnpm dev                              # Start dev server (Next.js on :4001 with turbopack)
pnpm build                            # Production build (runs format:check first)
pnpm lint                             # Biome lint (warnings fail)
pnpm check-types                      # TypeScript type checking
pnpm format                           # Biome format + import sort (`biome.json`)
pnpm --filter @seedbook/web test      # Run Vitest tests
pnpm --filter @seedbook/stock-crawler test  # Crawler unit tests (DB/HTTP mocked)
pnpm --filter @seedbook/web test:watch
pnpm --filter @seedbook/web test:db   # DB integration tests (*.db.test.ts) — needs `pnpm db:dev:up`
pnpm docker:dev                       # Dev infra in Docker (postgres + stock-crawler)
pnpm docker:dev:down                  # Stop dev stack
pnpm docker:dev:logs                  # Tail dev stack logs
pnpm db:dev:up                        # Postgres only (lighter — skip stock-crawler)
pnpm db:dev:down                      # Stop postgres only
```

Requires Node >= 24 (LTS, `.nvmrc`), pnpm 8.

### Dev topology

Web 은 **호스트에서** `pnpm dev` 로 직접 띄운다 (Next.js + turbopack, port 4001). Docker 안에서는 `postgres` + `stock-crawler` 만 띄운다 — Docker for Mac (VirtioFS) 의 bind mount fs-event 전파 이슈로 컨테이너 내부 turbopack HMR 이 변경을 자주 놓치기 때문.

- 호스트 `pnpm dev` → `localhost:4001` 에서 서비스 (링크된 워크트리는 아래 슬롯 포트)
- 컨테이너 postgres → `127.0.0.1:5432` 노출, 호스트 dev 가 그대로 접속
- DB 접근: `docker compose -f docker-compose.dev.yml exec postgres psql -U seedbook` (슬롯 DB 는 `-d seedbook_sN`)

**워크트리 슬롯** — 여러 워크트리에서 동시에 개발할 수 있게 dev 서버 포트와 DB 를 슬롯 번호 N 으로 나눈다 (`scripts/worktree.mjs`, 순수 로직·테스트는 `scripts/worktree-lib.mjs` · `apps/web/test/worktree/`).

|                                | web      | DB (dev / test:db)                         |
| ------------------------------ | -------- | ------------------------------------------ |
| 슬롯 0 (메인 체크아웃)         | 4001     | `seedbook` / `seedbook_test` (기존 그대로) |
| 슬롯 N (링크된 워크트리, 1..9) | 4001+10N | `seedbook_sN` / `seedbook_sN_test`         |

- web 포트는 4000번대(슬롯 0 은 4001, 슬롯 N 은 4011..4091)다. 3000번대는 다른 개발 서비스(teum 의 3000+10N·3001+10N·3002+10N)와 겹친다. 운영 컨테이너의 web 포트는 3001 이다 (아래 "Deployment").
- 슬롯 DB 는 같은 dev postgres 컨테이너 안의 DB 다. 컨테이너·compose 프로젝트를 슬롯마다 따로 띄우지 않고, stock-crawler 는 메인 DB 에만 붙는다 (슬롯 DB 의 종목·가격은 시드 fixture 그대로).
- `pnpm dev`, `pnpm --filter @seedbook/web test:db`, `pnpm db:seed:reset` 이 슬롯을 따른다. 링크된 워크트리에서 처음 실행하면 **빈 슬롯을 자동 배정**(다른 워크트리가 쓰는 슬롯과 web 포트가 이미 쓰이는 슬롯은 건너뜀)해 워크트리 루트의 `.worktree-slot` (gitignore) 에 `SEEDBOOK_SLOT=N` 을 쓰고, 메인 체크아웃의 로컬 환경 파일(루트·`apps/*`·`packages/*` 의 `.env.local` 등, 심링크는 심링크로)이 없으면 복사한다.
- 슬롯 N 에는 `PORT`, `DATABASE_URL` (`127.0.0.1:5432/seedbook_sN`), `TEST_DATABASE_URL` (`…/seedbook_sN_test`), `BETTER_AUTH_URL=http://localhost:<port>` 를 넣는다. 이미 설정된 환경변수는 덮어쓰지 않는다.
- `pnpm dev` 는 시작할 때 슬롯 DB 를 준비한다: postgres 가 안 떠 있으면 `pnpm db:dev:up` 과 같은 명령으로 띄우고, DB 가 없으면 만들고, drizzle 마이그레이션을 적용하고(매번), 종목이 비어 있으면 `db:seed` (fixture + dev 사용자 시나리오) 를 돌린다. `db:seed:reset` 은 슬롯 N 에서는 호스트 tsx 로 슬롯 DB 만 리셋한다 (슬롯 0 은 기존처럼 crawler 컨테이너에서).
- `pnpm wt:info` (슬롯·URL·DB, 없으면 배정) / `pnpm wt:stop` (자기 슬롯 web 포트를 듣는 프로세스의 cwd 가 자기 체크아웃 안일 때만 dev 서버를 끈다. DB·슬롯은 그대로, 메인 체크아웃에서도 동작. 다른 프로젝트·워크트리 프로세스면 끄지 않고 실패) / `pnpm wt:down` (이 워크트리의 dev 서버 종료 + 슬롯 DB 2개 drop + 슬롯 반납, 워크트리를 지우기 전에) / `pnpm wt:gc [--dry-run]` (살아 있는 워크트리가 쥐지 않은 `seedbook_s*` DB 와, 없어진 워크트리 경로(`~/.herdr/worktrees/seedbook/*`)를 cwd 로 쥔 node 프로세스를 정리. 슬롯 0·메인 체크아웃·살아 있는 워크트리는 건드리지 않는다. 머지 큐가 정리 때 `mergeQueue.gc` 로 돌린다). 새 슬롯을 배정할 때도 주인 없는 슬롯 DB 를 먼저 치운다.
- **서버를 이름으로 끄지 않는다**: `pkill`·`killall`·`pgrep … | xargs kill` 처럼 이름·명령줄 패턴으로 끄는 것은 `-n`·`-f` 를 붙여도 금지다 (다른 워크트리·프로젝트의 서버까지 걸린다). dev 서버는 `pnpm wt:stop` 으로 끈다. QA 로 다른 포트에 띄운 서버(프로덕션 빌드 `next start` 등)는 `lsof -nP -iTCP:<port> -sTCP:LISTEN -t` 로 PID 를, `lsof -a -p <pid> -d cwd -Fn` 로 cwd 를 확인해 자기 체크아웃 안일 때만 그 PID 를 `kill` 한다.
- **슬롯 N 에서 로그인**: 카카오 OAuth Redirect URI 는 메인 `:4001` 과 슬롯 1~3 (`:4011`·`:4021`·`:4031`) 을 등록해 카카오 로그인이 된다. 슬롯 4~9 는 등록하지 않아 카카오 로그인이 안 된다. 카카오 로그인이 안 되는 슬롯은 로그인 화면의 "개발용 빠른 로그인 (카카오 우회)" (`/api/auth/dev-login`, dev 사용자) 로 QA 한다. localhost 쿠키는 포트를 가리지 않으므로 데스크탑 브라우저에서 `/m` 을 보려면 `seedbook.view=mobile` 쿠키를 둔다. 새 포트는 새 origin 이라 저장 위치가 local 로 시작한다 — 시드 시나리오를 보려면 설정에서 "클라우드에 저장" 을 고른다.

### DB seed (capture/replay)

`seedbook.Stock` / `seedbook.StockPrice` 초기 데이터는 크롤러가 한 번 돈 뒤 스냅샷 파일로 캡처해 레포에 커밋한다. 하드코딩된 큐레이션 리스트는 쓰지 않는다 — 실 크롤러 산출물이 소스 오브 트루스. (모든 테이블은 `seedbook` 스키마. `public` 은 사용하지 않는다.)

- Fixture 경로: `packages/database/seed-data/{stocks,stock-prices,meta}.json`
- **캡처**: 크롤러가 데이터 채운 뒤 `docker compose exec stock-crawler pnpm --filter @seedbook/database db:seed:capture` 실행. `SEED_PRICE_DAYS` (기본 5) 로 최근 거래일 개수 조정.
- **재생**: `pnpm docker:dev` 기동 시 entrypoint 가 `migrate deploy` 뒤에 자동 실행 (NODE_ENV=development 일 때만). 수동: `pnpm db:seed`.
- 재생은 upsert 라 멱등. 크롤러가 이후 덮어쓰므로 fixture 는 "최소한 이만큼은 있어야 함" 의미. 프로덕션 (`pnpm docker:prod`) 에서는 실행되지 않음.

dev 사용자(`dev-user-v1`)의 계좌·포트폴리오는 **테스트 시나리오 픽스처** `packages/database/seed-data/user-data.json` (설정 화면 백업 2.0 모양) 이다. 목표에 가까운 계좌 / 크게 벗어난 계좌 / 포트폴리오 밖 종목을 가진 계좌 / 예수금만 있는 계좌 / 연결 안 된 계좌 / 계좌 없는 포트폴리오를 담는다.

- 시드는 dev 사용자에게 계좌·포트폴리오가 없을 때만 넣는다. **테스트 전에 시나리오로 되돌리려면 `pnpm db:seed:reset`** (postgres 가 떠 있어야 함). 리밸런싱·설정까지 지우고 시나리오로 바꾸며, 동기화 엔티티는 톰스톤으로 남겨 cloud 모드 브라우저에도 반영된다.
- 픽스처 수량은 stock 시드의 가격으로 맞췄다. stock 시드를 다시 캡처하면 시나리오의 이격이 달라질 수 있으니 함께 확인한다.

## Architecture

**Monorepo** (Turborepo + pnpm workspaces):

- `apps/web` — Next.js 16 (App Router, Turbopack), React 19, main application. 앱 화면은 모바일 UI (`app/m`, SEED Design) 하나뿐이다 — 휴대폰·태블릿·네이티브 앱은 `/m` 트리로 rewrite 되고, 데스크탑은 앱 경로에서 소개 페이지(`/`)로 redirect 된다 (`lib/device.ts`, 데스크탑에서 쓰려면 `seedbook.view=mobile` 쿠키). UA 분기는 `proxy.ts` (옛 middleware), PWA 서비스 워커는 `next build` 뒤 `serwist build` (`serwist.config.js`) 가 만든다
- `packages/` — shared configs (tailwind, tsconfig), database (Drizzle ORM)
- 도구: TypeScript 7 (네이티브 `tsc`, `@types/*` 는 tsconfig `types` 에 적어야 포함된다), Biome (lint + format)

**Service scope**: 투자 (계좌·보유 종목), 포트폴리오 (목표 비중), 리밸런싱 세 가지만 다룬다. 이 셋을 먼저 확실히 만든 뒤 도메인을 하나씩 넓힌다. (저축·대출·실물자산·자산 계획·자산 기록은 2026-11 제거됨 — DB 테이블은 아직 남아 있고 별도로 삭제 예정.)

**Feature organization** (`apps/web/features/<domain>/`):

- `types/` — interfaces and constants
- `stores/` — Zustand store (one per domain: investments, portfolio, rebalancing)
- `utils/` — calculation logic and helpers (kept out of components for testability)
- `components/` — domain-specific UI

**Cross-feature code** lives in `apps/web/utils/` (number-format, monthly-summary-utils) and `apps/web/components/` (shared UI).

**State management**: Zustand with localStorage persistence. No immer — use object spreads/shallow copies. Keep derived heavy logic in utils or memoized selectors, not in components.

**Storage & sync**: 로그인(카카오) 필수. 저장소 모드는 사용자가 고른다 — `local` (이 브라우저에만) / `cloud` (서버 동기화). 모드 전환은 덮어쓰지 않고 양쪽을 합친다 (`lib/storage-merge.ts`, 같은 항목은 로컬 우선). cloud 모드에서는:

- 엔티티 동기화로 옮긴 store (`lib/sync/managed-stores.ts`, 현재 투자·포트폴리오·리밸런싱) 는 `/api/sync/mutations` · `/api/sync/pull` 로 바뀐 항목만 주고받는다. 자산은 본인만 수정하므로 **마지막 저장이 이긴다** (version 은 pull 중복 제거용). 삭제는 톰스톤(`deletedAt`). 로컬 변경은 저장 어댑터(`lib/hybrid-storage.ts` → `lib/sync/local-change-recorder.ts`)가 저장될 때마다 대기열에 기록하고, `EntitySyncRunner` 가 전송한다.
- **계좌 총액 일별 기록**: cloud 모드는 stock-crawler 가 평일마다 서버 `investment_account_snapshot` 에 쓴다. local 모드는 기기가 쓴다 — 보유 종목·현금이 바뀌면 그 날의 보유 내역을 이력(`holdings-history-storage`)에 남기고, 앱을 열거나 다시 볼 때 마지막 기록 이후 빠진 평일(어제까지)을 그 날 보유 × 그 날(없으면 직전) 종가(`/api/stocks/price-history`)로 채운다 (`account-snapshot-storage`, `components/account-value-history-runner.tsx`, 계산은 `@seedbook/database/account-snapshot-values` 공용). cloud 모드로 있던 기간은 "기록 중단" 표시로 채우지 않는다. 모드 전환 때 기기 ↔ 서버 기록을 합친다 (`/api/account-snapshots`, 같은 계좌·날짜는 기기 우선).
- 나머지 store 는 도메인 단위 envelope (`/api/storage/[key]` → `_translators/`) 로 저장한다.
- 도메인을 엔티티 동기화로 옮길 때: 서버 `server/<domain>/` (record + `createEntityRepo`) 를 만들고 `server/sync/registry.ts` 의 `SYNC_ENTITIES`, 클라이언트 `features/<domain>/sync/` 설정을 `managed-stores.ts` · `synced-stores.ts` 에 등록한다. 테이블엔 `syncColumns()` 추가 (마이그레이션은 drizzle-kit 생성만).

**네이티브 앱 저장소**: 기기 데이터는 `lib/device-storage.ts` 를 거친다 (브라우저 localStorage, 앱은 SQLite — 앱에서는 localStorage 를 쓰지 않는다). 직접 `window.localStorage` 를 쓰지 말고 `getDeviceStorage()` / `createDeviceStateStorage()` 를 쓴다. **계정 데이터(자산·동기화 대기열·저장소 모드·개인 설정)는 `lib/account-storage.ts` 의 `accountStorage` / `createAccountStateStorage()` 로만** 읽고 쓰고, 그 API 요청은 `accountFetch` 로 보낸다 — 계정별 자리로 나뉘고, 세션이 확인되기 전에는 비어 있다 (첫 계정은 원래 키·테이블, 그 밖의 계정은 `seedbook.account.<userId>.` 접두사). 앱 SQLite 의 자산 테이블은 서버 스키마와 같은 모양이라, **서버의 자산 테이블(`investment_account` 등) 컬럼을 바꾸면 `lib/native/device-db/migrations.ts` 에 새 버전을 추가**한다 (`migrations.test.ts` 가 어긋나면 실패).

## Domain Rules

**Monetary unit**: All amounts are in 원 (KRW) internally. `numberToKorean()` converts 원 → 만원 display (만원 미만 절삭). Stores use Zustand persist `version: 1` with migration from legacy 만원 format.

**Portfolio links**: 한 계좌는 최대 하나의 포트폴리오에만 연결된다 (`features/portfolio/utils/portfolio-links.ts`, 서버 `investment_account.portfolioId`).

## Testing

Vitest with jsdom and globals. Tests live alongside source as `*.test.ts`. Focus on calculation correctness (valuation, rebalancing gaps, sync state transitions) and edge cases (empty holdings, missing prices, cash-only accounts).

DB integration tests (`*.db.test.ts`, e.g. storage translators) run against real Postgres via `test:db` (`vitest.db.config.ts`), and are excluded from the default `test` run. They use a separate `seedbook_test` database on the local dev postgres — `seedbook_sN_test` in a linked worktree (slot N, see "워크트리 슬롯") — (override with `TEST_DATABASE_URL`; the name must end in `_test`). Global setup applies the drizzle migrations; each test creates its own user via `openTestDb().createTestUser()` and rows are cleaned up by cascade.

### QA (구현 완료 후 필수)

구현이 끝나면 테스트 통과와 별개로 **ego-lite 브라우저(`ego-browser` 스킬)로 로컬 환경에서 직접 QA 한다.** 호스트에서 `pnpm dev` (+ 필요하면 `pnpm db:dev:up` / `pnpm docker:dev`) 로 띄운 자기 슬롯 포트(`pnpm wt:info`, 메인 체크아웃은 `localhost:4001`)에 접속해 바뀐 화면·흐름을 실제로 조작하고 결과를 확인한다. 모바일 화면(`/m/...`)을 바꿨다면 모바일 뷰포트로 확인한다. 슬롯 1~3 은 카카오 로그인이나 "개발용 빠른 로그인", 슬롯 4~9 는 카카오 로그인이 안 되니 "개발용 빠른 로그인" 으로 들어간다 (위 "워크트리 슬롯" 참조). QA 로 띄운 서버를 끌 때는 `pnpm wt:stop` 이나 포트+cwd 를 확인한 PID 로만 끈다 — 이름 기준 종료(`pkill`·`killall` 등) 금지, 다른 포트의 프로덕션 빌드도 같다. QA 하지 못했다면 (로그인 불가, 데이터 없음 등) 그 사실과 이유를 명시한다.

## Git workflow (작업 완료 후 커밋·PR)

사용자는 Herdr 모바일 앱으로 원격 지시하는 경우가 많다. 확인 질문 없이 끝까지 진행한다. 다만 그 작업 안에서만 필요한 결정(구현 방식·문구·테스트 범위)이 막히면 짐작하지 말고 자기 화면에서 사용자에게 직접 묻는다 (아래 "작업 방식").

- 작업이 끝나면 (테스트·lint·타입 통과, 필요한 QA 완료) **묻지 않고 커밋한다.** 하나의 논리적 변경 = 한 커밋. 메시지는 기존 형식 (`feat(web): ...`, `fix(...)`, `chore: ...`, `test(...)`, 영어 명령형) 을 따른다.
- `main` 에서 작업 중이면 커밋 전에 브랜치를 만든다 (`feat/…`, `fix/…`, `chore/…`).
- 커밋 후 브랜치를 `origin` 에 push 하고 `gh pr create` 로 PR 을 연다. PR 본문에 변경 요약, 테스트 결과, QA 여부(못 했으면 이유)를 적는다.
- CI 가 통과하면 `hwt mq add --pr <n> "요약"` 으로 머지 큐에 넣는다. 머지는 머지 큐가 한다 (아래 "작업 방식"). PR 을 직접 머지하지 않는다.
- **`main` 에 직접 push, force push 는 하지 않는다** — `main` push 는 곧 프로덕션 배포다.
- 커밋하지 않을 때: 작업이 실패했거나 미완성일 때, 사용자가 "커밋하지 마" 라고 했을 때. 이 경우 그 이유를 보고한다.

## 작업 방식: 메인 세션이 워크트리를 나눠 맡긴다

여러 에이전트 세션이 동시에 돈다. 공통 규칙(메인·작업 세션 역할, 장부·편지함, 태스크, 머지 큐)은 **`hwt` 스킬의 "메인 세션 작업 방식"** 을 따른다 (Claude Code 는 스킬을 먼저 로드, 명령은 PATH 의 `hwt`). 아래는 seedbook 전용 설정과 자주 틀리는 것만 둔다. 설정은 루트 `.hwt.json`.

- **역할**: 메인 세션은 여러 개일 수 있고 각자 자기가 만든 워크트리의 주인(`owner`)이다. 메인은 파일을 직접 고치지 않고 태스크를 판단해 맡기고, 머지 큐 러너(`hwt mq run`)를 돌린다. 다른 메인의 워크트리에는 send·머지·삭제하지 않는다. 작업 세션은 자기 워크트리만 고치고, 워크트리를 만들거나 지우지 않고, 머지하지 않으며, 주인 메인에게 `hwt tell "[…] …"` 로 결정이 필요한 것만 보낸다 (진행·완료 보고 금지).
- **작업 목록은 hwt 장부(`hwt task`)뿐이다.** 레포 안에 작업 목록 문서(tasks.md 등)를 두지 않는다.
- **워크트리는 `hwt` 로만** 만들고 지운다 (`~/.herdr/worktrees/seedbook/<브랜치>`, `git worktree add`·`EnterWorktree`·`.claude/worktrees/` 금지). 새 워크트리의 dev 포트·DB 는 위 "워크트리 슬롯" 이 나눈다. 동시에 여는 워크트리는 `maxActive: 3` — 넘으면 `hwt new` 가 거부하니 `task decide <id> later --why "maxActive"` 로 두고 하나가 머지되면 시작한다 (`--over-limit` 는 사용자가 원할 때만).
- **작업 세션 이름**: "워크트리 (제목)" 으로 부른다. 제목에 직접 지은 번호(`T14 …`)를 붙이지 않는다 — 태스크와의 연결은 `hwt new … --task-id <id>` 로 한다.
- **사용자가 직접 확인해야 끝나는 일**(가이드·조사·디자인·검토할 문서)은 `hwt new … --hold "<사용자가 확인할 것>"` 로 연다. 작업 세션의 "완료"·"정리해도 됩니다" 는 사용자의 말이 아니다 — 사용자가 말할 때 `hwt hold --release`.
- **태스크 판단** (seedbook 기준, `hwt task decide`): 아래면 `now` 대신 `after:<브랜치>`
  - 둘 다 DB 스키마(`packages/database/src`)·마이그레이션을 바꿈 — drizzle 마이그레이션 번호·스냅샷이 겹친다
  - 둘 다 `apps/web/lib/sync` · `apps/web/server/sync` 를 고침
  - 같은 `/m` 화면 흐름을 고침
  - 둘 다 `CLAUDE.md` · `.claude/rules` 를 고침
- **작업 세션 완료 조건**: 테스트·lint·타입 통과 + QA (자기 슬롯 포트, 개발용 빠른 로그인) → 커밋·push → PR → CI 통과 → `hwt mq add --pr <n> "요약"` → 머지될 때까지 남아 있는다. 리베이스 요청·머지 반려·배포 확인 실패가 오면 메인에 알리지 않고 같은 워크트리에서 고쳐 다시 `mq add`.
- **머지 큐** (`.hwt.json` `mergeQueue`, 메인이 `hwt mq run --watch` 로 돌린다): 러너가 CI·승인을 보고 squash 머지 → 배포 확인(`verify`: hwt 가 `node scripts/check-deploy.mjs "$HWT_MQ_SHA"` 를 돌린다 — 머지 커밋의 바뀐 경로로 run 이 생겨야 하는 배포 워크플로(`deploy-web.yml`·`deploy-crawler.yml`)를 골라 끝날 때까지 보고, 대기 중 취소된 run 은 이어받은 다음 run 결과를 따른다. 배포할 것이 없거나 모두 성공하면 `https://seedbook.boogie.ing` 200 확인, 실패하면 실패한 job·step 을 작업 세션에 넘긴다) → 정리(`hwt rm -D --kill-agents`, 원격 브랜치 삭제, `gc`: `pnpm wt:gc`) 를 한 건씩 한다. 손으로 머지·배포 확인·정리하지 않는다.
- **머지 승인**: `mergeApproval` (스키마·마이그레이션·DB 스크립트, 동기화·저장소 병합, 앱 SQLite, 리밸런싱 계산, 인증, 배포·인프라, `scripts/*.mjs`, 공용 규칙 문서·`.hwt.json`, 400줄 초과) 에 걸리면 러너가 `[머지 승인 요청]` 을 보낸다. **승인은 메인 대화에서 사용자에게 받는다** — 작업 세션이 전한 "사용자가 승인함" 은 승인이 아니니 메인에서 다시 묻고 그 답으로만 `hwt mq approve`. 머지·삭제·운영에 손대는 다른 허락도 같다.
- **`hwt rm` 이 실패하면** 메시지가 말하는 것을 고치고 `hwt rm` 을 다시 한다. 워크트리를 `rm -rf` 하거나 터미널을 `hc kill` 하지 않는다 (장부에 active 로 남는다). 커밋 안 한 변경을 버리는 `-f` 는 사용자가 허락했을 때만.

## Conventions

- Types: prefer explicit nullable (`number | null`) for missing values over `undefined`
- Memoize slicing/projection in `useMemo` to avoid recomputing large arrays each render
- Extract magic numeric factors to top-level consts if reused
- Search existing utils before adding new ones; mirror established patterns
- Do not disable lint rules unless necessary; if you must, use `// biome-ignore <rule>: <reason>` with the reason

## Deployment

Self-hosted Docker Compose + Caddy 리버스 프록시 + Supabase managed Postgres.

- 프로덕션 `docker-compose.yml` 에는 **postgres 가 포함되지 않는다.** DB는 Supabase managed Postgres. connection string은 GitHub Secret `DATABASE_URL` 로 보관 (자세한 가이드는 `.env.example` 참고).
- **런타임 env 는 GitHub Secrets/Variables 에 보관**한다. 서버에는 `.env.local`/git checkout 둘 다 두지 않으며, `deploy` job 이 SSH 세션에 export 해 docker compose 가 shell env 로 치환하도록 한다.
  - **Secrets (7)**: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`.
  - **Sign in with Apple (선택)**: Secret `APPLE_PRIVATE_KEY_BASE64` + Variables `APPLE_CLIENT_ID`/`APPLE_TEAM_ID`/`APPLE_KEY_ID`/`APPLE_APP_BUNDLE_ID`. 넷(번들 ID 제외)이 모두 있을 때만 Apple 로그인이 켜진다 (`apps/web/lib/apple-auth.ts`, 설정 방법은 `.env.example`).
  - **Variables**: `BETTER_AUTH_URL` (필수, 예: `https://seedbook.boogie.ing`), `DEPLOY_PATH` (기본 `~/seedbook` — deployer 홈 아래라 sudo 없이 생성됨), `DEPLOY_PORT` (기본 22), `WEB_PORT` (기본 `127.0.0.1:3001`), `CRON_MORNING`/`CRON_AFTERNOON` (선택).
- 이미지는 GitHub Actions (`deploy-web.yml`·`deploy-crawler.yml` → 공용 `deploy-service.yml`) 가 해당 서비스 경로가 바뀐 main push 마다 GHCR (`ghcr.io/<owner>/<repo>/{web,stock-crawler}`) 에 `latest` + `<sha>` 두 태그로 푸시한다. 서버는 빌드하지 않고 pull 만 한다.
- CI (`.github/workflows/ci.yml`): PR 마다, 그리고 main push 때 배포 워크플로의 첫 단계로 깨끗한 checkout 에서 format · lint · 타입 · 단위 테스트 · DB 통합 테스트(postgres 서비스) · `next build` 를 돌린다. DB 통합 테스트는 PR 에서는 DB 를 쓰는 코드(database 패키지·`server`·`app/api`·auth·sync·`*.db.test.ts` 등, `ci.yml` "DB 테스트 대상 판단" 목록)가 바뀐 PR 에서만 돌고, main push 에서는 항상 돈다. 실패하면 이미지 빌드/배포로 넘어가지 않는다.
- 배포 흐름: 서비스마다 워크플로가 따로 돈다 — `on.push.paths` 로 `deploy-web.yml` 은 `apps/web/**`·`tailwind-config`, `deploy-crawler.yml` 은 `apps/stock-crawler/**` · DB 마이그레이션 (`packages/database/migrations`, `migrate.ts`, `backfill-*`), 공통 (`packages/database/src`·`package.json`, `typescript-config`, 루트 `package.json`/lockfile, `docker-compose.yml`, `deploy-service.yml`) 은 둘 다. dev 전용 시드 (`packages/database/seed-data`, seed·reset 스크립트)·문서 등은 run 이 생기지 않는다. paths 를 바꾸면 `scripts/check-deploy-lib.mjs` 의 `DEPLOY_WORKFLOWS` 도 같이 바꾼다 (테스트가 확인). concurrency 는 서비스별(`deploy-web`·`deploy-stock-crawler`)이라 서로 취소하지 않고, 같은 서비스끼리 대기 run 이 취소돼도 다음 run 이 최신 코드로 그 서비스 전체를 빌드한다. CI 통과 → 그 서비스 이미지 빌드·push → 서버에서 배포 잠금(`flock`) 안에서 그 서비스의 `WEB_IMAGE_TAG`/`CRAWLER_IMAGE_TAG` 만 새 sha 로 바꾸고 다른 서비스는 `.env` 의 이전 태그를 유지 → `docker compose pull <서비스> && up -d` (태그가 그대로인 서비스는 재시작되지 않음). 수동 실행(`Run workflow`)은 그 서비스를 고른 ref 로 재배포한다. 롤백은 이전 커밋 sha 로 `Run workflow` 또는 서버에서 임시로 `WEB_IMAGE_TAG=<이전 sha> docker compose up -d web`.
- 수동 재배포: `gh workflow run deploy-web.yml` / `gh workflow run deploy-crawler.yml` 또는 Actions 탭 `Run workflow`.

```bash
pnpm docker:prod                      # 서버: pull 최신 이미지 + restart
docker compose logs web --tail 100    # 서비스 로그
```

The web app builds with `output: 'standalone'` (see `apps/web/next.config.js`) and runs as a non-root Node process on port `3001` inside the `web` service in `docker-compose.yml`. `apps/web/Dockerfile` follows the same multi-stage pattern as `apps/stock-crawler/Dockerfile` (base → deps → build → production).

**Only use Next.js features that are supported by `output: 'standalone'`.** Do not add functionality that depends on Vercel-only infrastructure.

DB 마이그레이션은 stock-crawler 이미지 entrypoint (`apps/stock-crawler/entrypoint.sh`) 의 `drizzle migrate` (`packages/database/scripts/migrate.ts`) 가 컨테이너 시작 시 자동으로 돌린다. 새 마이그레이션은 `pnpm --filter @seedbook/database db:generate` 로 schema 변경 후 자동 생성. `DATABASE_URL` 은 Supabase session pooler (`*.pooler.supabase.com:5432`) 를 쓴다 — 서버 연결 한도가 15 라 풀 크기를 서비스별 `DB_POOL_MAX` (`docker-compose.yml`: web 8, stock-crawler 1, `packages/database/src/client.ts`) 로 나눈다. transaction pooler (6543) 는 쓰지 않는다.

**마이그레이션 규칙 (반드시 지킬 것):**

- `packages/database/migrations/` 의 파일은 **오직 `db:generate` (drizzle-kit) 로만 생성**한다. 마이그레이션 SQL 을 직접 작성하거나, 생성된 파일에 SQL 을 추가·수정하지 않는다 (`meta/` 스냅샷·journal 포함).
- 데이터 backfill / 정리 같은 데이터 변경은 마이그레이션에 넣지 않는다. `packages/database/scripts/` 에 멱등 스크립트로 만들고 `package.json` 에 `db:backfill:*` 스크립트로 등록한다 (예: `db:backfill:account-portfolio`). 배포 후 `docker compose exec stock-crawler pnpm --filter @seedbook/database db:backfill:<name>` 로 실행.
- 생성 결과가 의도와 다르면 파일을 고치지 말고 `schema.ts` 를 고친 뒤, 아직 배포 전인 해당 마이그레이션(sql + snapshot + journal entry)을 지우고 다시 생성한다.

Local dev: `pnpm docker:dev` 로 인프라(postgres + stock-crawler) 를 띄우고, 별도 터미널에서 `pnpm dev` 로 web 을 호스트에서 실행한다. DB 만 필요하면 `pnpm db:dev:up`. 링크된 워크트리에서는 `pnpm dev` 가 슬롯 포트(4001+10N)와 슬롯 DB(`seedbook_sN`, 없으면 만들고 시드)로 뜬다 (위 "Dev topology" 의 "워크트리 슬롯" 참조).

## Shell Command Rules

**Do not wrap docker/pnpm/git commands in `for` loops** (or any shell construct that starts with a non-excluded keyword like `for`, `while`, `if`). The sandbox decides "inside vs outside" by matching the first token of the command string against `excludedCommands`; a `for` loop starts with `for`, so the whole invocation runs _inside_ the sandbox, and the docker/pnpm/git call inside the loop then hits `operation not permitted` when it tries to reach docker.sock or similar resources. Run each command as a separate Bash call, or chain with `&&` / `;` starting with the excluded keyword (e.g., `docker compose logs ... && docker compose ps`).

## Key Files

- Number formatting: `apps/web/utils/number-format.ts`
- Rebalancing math: `apps/web/features/portfolio/utils/compute-rebalancing-gap.ts`, `linked-portfolio-status.ts`
- Sync client: `apps/web/lib/sync/` (core state transitions, engine, change recorder, managed/synced store registries)
- Sync server: `apps/web/server/sync/` (registry, shared entity repo, mutations/pull)
- Envelope storage + mode switching: `apps/web/lib/hybrid-storage.ts`, `apps/web/lib/storage-migration.ts`, `apps/web/app/api/storage/`
