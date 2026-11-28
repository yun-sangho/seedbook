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
- **브라우저에서 앱의 기기 저장(SQLite `records`) 확인**: 개발 서버에서 `seedbook.deviceDb=sqlite` 쿠키를 두면 브라우저가 localStorage 대신 WASM SQLite(`sql.js`, 파일은 IndexedDB)로 앱과 같은 저장 경로를 쓴다 (`lib/native/device-db/sqljs-driver.ts`). 켤 때 브라우저 데이터를 복사하고 원본은 남긴다 — 쿠키를 지우면 원래 localStorage 로 돌아간다. 프로덕션 빌드는 쿠키를 무시한다.

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
- `packages/` — shared configs (tailwind, tsconfig), database (Drizzle ORM, 서버 전용), domain (서버·앱 공용 순수 TS — 동기화 레코드 정의, `v1/*-record.ts` 행 변환·검증, `kst`, `account-snapshot-values`, 약관 `legal`)
- **클라이언트는 서버 코드를 import 하지 않는다** (`/m` 은 앱 번들로 옮겨진다): `app/m`·`features`·`components`·`lib` 등 클라이언트 코드에서 `@web/server/*`·`@web/app/api/*`·`@seedbook/database`·node 모듈 금지 (타입 import 포함). 서버와 같이 쓰는 것은 `@seedbook/domain/<경로>` 에 두고 양쪽이 거기서 import 한다. biome `noRestrictedImports` (biome.json overrides) 가 직접 import 를, `lib/client-imports-guard.test.ts` 가 간접으로 닿는 것까지 막는다 — 서버 전용 파일을 클라이언트 트리에 두면 두 곳의 예외 목록에 함께 넣는다.
- database 패키지가 import 하는 domain 모듈 (`kst`·`anonymous-identity`·`account-snapshot-values`·`legal/types`·`legal/markdown`) 은 다른 모듈을 import 하지 않는다 — database dist 를 운영 stock-crawler 가 node 로 실행하는데, node 와 nodenext `tsc` 모두 확장자 없는 상대 import 를 못 푼다 (`packages/domain/src/database-imports.test.ts`). 여러 파일에 걸친 서버 전용 로직은 database 에 둔다.
- 도구: TypeScript 7 (네이티브 `tsc`, `@types/*` 는 tsconfig `types` 에 적어야 포함된다), Biome (lint + format)

**Service scope**: 투자 (계좌·보유 종목), 포트폴리오 (목표 비중), 리밸런싱 세 가지만 다룬다. 이 셋을 먼저 확실히 만든 뒤 도메인을 하나씩 넓힌다. (저축·대출·실물자산·자산 계획·자산 기록은 2026-11 제거됨 — DB 테이블은 아직 남아 있고 별도로 삭제 예정.)

**Feature organization** (`apps/web/features/<domain>/`):

- `types/` — interfaces and constants
- `stores/` — Zustand store (one per domain: investments, portfolio, rebalancing)
- `utils/` — calculation logic and helpers (kept out of components for testability)
- `components/` — domain-specific UI

**Cross-feature code** lives in `apps/web/utils/` (number-format, monthly-summary-utils) and `apps/web/components/` (shared UI).

**State management**: Zustand. No immer — use object spreads/shallow copies. Keep derived heavy logic in utils or memoized selectors, not in components. 저장은 store 마다 정해진 저장 어댑터를 거친다 (아래 Storage & sync) — 자산 store 는 기기 레코드, 그 밖은 기기 저장소 envelope. 자산 store(투자·포트폴리오·리밸런싱)에는 persist `version`·`migrate` 를 두지 않는다 (모양은 레코드 정의가 정한다).

**Storage & sync** (동기화 v2): 로그인(카카오) 필수. 저장소 모드는 사용자가 고른다 — `local` (이 기기에만) / `cloud` (서버 동기화).

- **자산은 모드와 상관없이 기기 레코드에 둔다**: 화면 store 저장 → `lib/hybrid-storage.ts` → 레코드 계층(`lib/sync/v2/record-layer.ts`)이 레코드로 나눠(`store-records.ts` decompose/compose) 바뀐 레코드만 패치로 저장한다. 브라우저는 계정 자리의 키 하나(`seedbook.records`), 앱은 SQLite `records`. 저장 전에 화면 값 정리(`lib/sync/normalize-envelope.ts`, 입력 도중의 NaN → 0 등) 를 거친다.
- **cloud 모드**: 실제로 바뀐 필드를 outbox 에 기록하고 엔진(`lib/sync/v2/engine.ts`, `RecordSyncRunner`)이 `POST /api/sync/v2/push` · `GET /api/sync/v2/pull` 로 주고받는다. 서버는 `server/sync/v2/` (`record-repo.ts` 하나가 레코드 9종을 정의로 다룬다). 쓰기는 **패치**(보낸 필드만 바꾸고 안 보낸 필드는 그대로), 같은 필드는 나중 도착이 이긴다, **삭제가 이긴다**(톰스톤 `deletedAt`, 되살리지 않음), 부모를 지우면 하위도 톰스톤. pull 커서는 사용자별 `changeSeq` (`user_sync_state`). 서버가 레코드 테이블에 쓸 때는 반드시 `reserveChangeSeqs` 로 번호를 받는다 (안 받으면 pull 이 놓친다).
- **모드 전환**은 push/pull 로 합친다 (`lib/storage-migration.ts` → `lib/sync/v2/mode-switch.ts`, 같은 항목은 로컬 우선, 식물은 더 자란 쪽, 서버에서 지운 것은 되살리지 않음). cloud→local 은 보내지 못한 변경이 남으면 막는다. **백업**은 기기 레코드 그대로(`lib/sync/v2/backup.ts`, 파일 버전 ≤ 앱 버전만 불러온다).
- 동기화 v1(`/api/sync/mutations`·`/api/sync/pull`·`/api/storage/[key]`)은 지웠다 — 옛 JS 를 캐시한 클라이언트에 426 으로 답한다 (`server/sync/v1-retired.ts`).
- 계정 화면 설정(정렬·접힘)은 동기화 밖이다 — `/api/me/preferences` (기기에는 `settings` 레코드).
- **계좌 총액 일별 기록**: cloud 모드는 stock-crawler 가 평일마다 서버 `investment_account_snapshot` 에 쓴다. local 모드는 기기가 쓴다 — 보유 종목·현금이 바뀌면 그 날의 보유 내역을 이력(`holdings-history-storage`)에 남기고, 앱을 열거나 다시 볼 때 마지막 기록 이후 빠진 평일(어제까지)을 그 날 보유 × 그 날(없으면 직전) 종가(`/api/stocks/price-history`)로 채운다 (`account-snapshot-storage`, `components/account-value-history-runner.tsx`, 계산은 `@seedbook/domain/account-snapshot-values` 공용). cloud 모드로 있던 기간은 "기록 중단" 표시로 채우지 않는다. 모드 전환 때 기기 ↔ 서버 기록을 합친다 (`/api/account-snapshots`, 같은 계좌·날짜는 기기 우선). 파생 데이터라 동기화 v2 에 넣지 않는다.

**동기화 규칙 (데이터 모양을 바꿀 때 반드시 지킨다)**: 레코드 모양의 원본은 `packages/domain/src/records/*.ts` 의 정의(DSL) 하나다. 서버 컬럼(`schema.ts`)·클라이언트 store·기기 저장은 정의를 따르고, 대조 테스트(`apps/web/test/domain-contract/`)가 어긋남을 막는다. 손으로 쓴 사본을 두지 않는다.

- **서버 스키마는 확장만 한다.** 서버에는 늘 최신 정의 하나만 있고 버전별 변환 코드가 없다. 그래서 옛 앱(옛 JS·옛 번들)도 그대로 동기화한다 — 옛 앱은 모르는 필드를 보내지 않고(패치), 서버는 `default` 를 생성 때만 채우고, 기기는 받은 레코드를 통째로 보관한다.
- **변경 분류** (`packages/domain/src/compat.ts` 가 기계로 가른다):
  - **확장** (옛 앱을 막지 않음): 필드 추가 (생성 `default` 또는 nullable), 레코드 타입 추가, `open` enum 에 값 추가, 검증 완화, 기존 값을 `normalize` 로 고칠 수 있는 정리.
  - **깨는 변경**: 필드·레코드 타입 **제거**, **이름 변경**, **의미·단위·타입 변경**, **검증 강화** (옛 앱이 만들 수 있는 값을 거부하게 됨), 레코드 **분리·합치기**, `open` 이 아닌 enum 에 값 추가. 이름·의미를 바꾸고 싶으면 먼저 새 필드를 확장으로 더해 쓰고, 옛 필드 정리는 다음 깨는 변경에 모은다.
- **깨는 변경은 `MIN_SCHEMA` 를 같은 PR 에서 올리고 `up` 단계를 적는다** (`packages/domain/src/version.ts`). `up` 은 기기 레코드·outbox, 백업 불러오기(`lib/sync/v2/backup.ts` `BACKUP_STEPS`), 서버 backfill(`db:backfill:*`) 이 같은 함수를 쓴다 — 단계는 지우지 않는다 (오래된 기기·옛 백업이 여러 버전을 건너뛴다). `MIN_SCHEMA` 아래 앱은 push/pull 이 426 으로 멈추고 편집은 기기에 쌓인다. 서버보다 높은 앱은 409 로 기다린다.
- **버전 스냅샷**: 정의가 바뀌면(확장 포함) `SCHEMA_VERSION` 을 올린다. 출시(배포)한 버전의 정의는 `pnpm --filter @seedbook/domain schema:snapshot` 으로 `packages/domain/schema-snapshots/v<N>.json` 에 남기고 **고치거나 지우지 않는다** (첫 스냅샷 `v1` 은 동기화 v2-5 에서 커밋). `pnpm schema:check` (CI 필수) 가 지금 정의를 스냅샷과 비교한다 — 정의가 바뀌었는데 `SCHEMA_VERSION` 이 그대로거나, 깨는 변경인데 `MIN_SCHEMA` 를 안 올렸거나, 확장 조건(기본값 없는 필수 필드 등)을 어기면 실패한다.
- **옛 앱 재생 테스트** (`apps/web/server/sync/v2/old-app-replay.db.test.ts`): 지원 구간 `[MIN_SCHEMA, SCHEMA_VERSION]` 의 모든 스냅샷에 대해, 그 버전만 아는 클라이언트가 지금 서버로 모든 레코드를 만들고 받고 읽을 수 있는지, 새 기기가 쓴 레코드를 옛 앱이 패치해도 모르는 필드가 그대로인지 본다. 스냅샷을 추가하면 자동으로 대상이 된다.
- **서버 컬럼은 `schema.ts` → `pnpm --filter @seedbook/database db:generate` 로만** 바꾼다 (아래 "마이그레이션 규칙"). 추가는 nullable/default, 이름·타입 변경 금지. 컬럼 제거는 그 컬럼을 읽고 쓰는 코드를 먼저 배포한 **다음 PR** 에서 한다 — web 과 마이그레이션(stock-crawler)은 따로 배포돼 순서가 정해지지 않는다. 서버 repo 는 정의·공통 열만 읽는다 (`select()` 로 모든 컬럼을 읽지 않는다).
- **릴리스 순서**:
  - 확장: **서버 먼저** 배포 → 앱은 아무 때나 (서버보다 먼저 깔린 앱은 409 로 잠깐 기다린다).
  - 깨는 변경: 앱 빌드 → **스토어 심사 통과 후 수동 출시로 대기** → **서버 배포 + backfill** (이때부터 옛 앱은 426, 기기 저장은 계속) → 바로 **앱 공개** (OTA 면 번들 배포).
- **PR 체크리스트** (정의·서버 컬럼·동기화 코드를 바꾼 PR 은 본문에 적는다):
  1. 정의를 바꿨는가? 손으로 쓴 사본이 남지 않았는가? (`SCHEMA_VERSION` 올림)
  2. `pnpm schema:check` 가 확장으로 분류하는가? 깨는 변경이면 `MIN_SCHEMA`·`up`·backfill 이 같은 PR 에 있는가?
  3. 대조 테스트(`test/domain-contract`)와 옛 앱 재생 테스트(`test:db`)가 통과하는가?
  4. 스냅샷(`schema-snapshots/`)을 고치거나 지우지 않았는가? 배포했다면 새 스냅샷을 남겼는가?
  5. 릴리스 순서(확장: 서버 먼저 / 깨는 변경: 심사 통과 → 서버 → 앱 공개)와, 컬럼 제거라면 앞선 코드 배포를 PR 본문에 적었는가?
- **도메인을 동기화에 추가하는 방법**: ① `packages/domain/src/records/<type>.ts` 에 `defineRecord` 로 정의 (`table`·`parent`·`key`·`fields`·`sortable`) 하고 `records/index.ts` 의 `RECORDS` 에 부모 다음 순서로 넣는다. ② `schema.ts` 에 같은 이름의 컬럼 + 공통 열(`syncColumns()`·`changeSeq`·`sortKey`, 하위 레코드는 `childSyncColumns()`) 을 더하고 `db:generate`. 서버 repo 는 정의로 자동으로 다룬다 (`server/sync/v2/record-tables.ts`). ③ 클라이언트 store ↔ 레코드 변환을 `lib/sync/v2/store-records.ts` 의 `STORE_SHAPES`·decompose/compose 에, store 를 `record-sync-stores.ts` 에 등록하고, 저장 전 값 정리를 `normalize-envelope.ts` 에 더한다. store 는 `createHybridStorage(<key>)` 로 저장한다. ④ `SCHEMA_VERSION` 을 올리고 `schema:check`·대조 테스트·재생 테스트를 통과시킨다 (레코드 타입 추가는 확장 — 서버 먼저 배포).

**네이티브 앱 저장소**: 기기 데이터는 `lib/device-storage.ts` 를 거친다 (브라우저 localStorage, 앱은 SQLite — 앱에서는 localStorage 를 쓰지 않는다). 직접 `window.localStorage` 를 쓰지 말고 `getDeviceStorage()` / `createDeviceStateStorage()` 를 쓴다. **계정 데이터(자산·동기화 상태·저장소 모드·개인 설정)는 `lib/account-storage.ts` 의 `accountStorage` / `createAccountStateStorage()` 로만** 읽고 쓰고, 그 API 요청은 `accountFetch` 로 보낸다 — 계정별 자리로 나뉘고, 세션이 확인되기 전에는 비어 있다 (첫 계정은 원래 키·테이블, 그 밖의 계정은 `seedbook.account.<userId>.` 접두사).

**기기 레코드 저장소** (`lib/native/device-db/`): 앱 SQLite 의 자산·계정 설정은 레코드 JSON 테이블 `records` 하나에 둔다 (서버는 필드별 컬럼 그대로). 레코드 정의의 원본은 `packages/domain` 이다.

- **기기에 쓰는 길은 `writeRecords()` (`record-store.ts`) 하나**: 정의 검증 → 정규 직렬화(`NaN`·`Infinity`·`undefined` 는 예외) → 왕복 확인 → SHA-256 체크섬 → 이력(`records_history`, 레코드당 3개) → 한 트랜잭션. 다른 코드가 `records` 에 직접 쓰면 `record-store.test.ts` 가 실패한다. 검증에 실패한 값은 쓰지 않고 `records_quarantine` 에 남긴다 — 기기 데이터를 지우는 길은 사용자의 삭제(톰스톤)뿐이다.
- 읽기는 체크섬·정의를 확인하고, 실패한 행은 지우지 않고 격리한 뒤 이력의 마지막 정상 값을 쓴다. SQLite 도 `CHECK (json_valid(data))`·체크섬 길이로 막는다. 시작할 때 `PRAGMA quick_check`, 하루 1회·저장 틀 마이그레이션 직전에 `records` 스냅샷(최근 7개)을 남긴다 (`integrity.ts`).
- **레코드 필드가 늘어도 기기 마이그레이션은 없다.** `migrations.ts` 에 새 버전을 더하는 것은 `records`·outbox 같은 저장 틀을 바꿀 때뿐이다 (버전 8 이 옛 서버 모양 자산 표·`user_list_order`·`device_quarantine` 을 지웠다). 계좌 총액 기록 표(`table-envelopes.ts`)·`device_kv`·저장소 모드(`user_preference.storageMode`)는 그대로 쓴다. 계정 설정 envelope 은 `settings` 레코드다 (`settings-envelope.ts`).

## Domain Rules

**Monetary unit**: All amounts are in 원 (KRW) internally (레코드 정의의 `money` 필드). `numberToKorean()` converts 원 → 만원 display (만원 미만 절삭).

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
- PR 을 열자마자 `hwt mq add --pr <n> "요약"` 으로 머지 큐에 넣고 턴을 끝낸다. CI·머지를 기다리거나 `gh` 로 반복 확인하지 않는다 (CI 는 큐가 기다린다). 머지는 머지 큐가 한다 (아래 "작업 방식"). PR 을 직접 머지하지 않는다.
- **`main` 에 직접 push, force push 는 하지 않는다** — `main` push 는 곧 프로덕션 배포다.
- 커밋하지 않을 때: 작업이 실패했거나 미완성일 때, 사용자가 "커밋하지 마" 라고 했을 때. 이 경우 그 이유를 보고한다.

## 작업 방식: 메인 세션이 워크트리를 나눠 맡긴다

여러 에이전트 세션이 동시에 돈다. 공통 규칙(메인·작업 세션 역할, 장부·편지함, 태스크, 머지 큐)은 **`hwt` 스킬의 "메인 세션 작업 방식"** 을 따른다 (Claude Code 는 스킬을 먼저 로드, 명령은 PATH 의 `hwt`). 아래는 seedbook 전용 설정과 자주 틀리는 것만 둔다. 설정은 루트 `.hwt.json`.

- **역할**: 메인 세션은 여러 개일 수 있고 각자 자기가 만든 워크트리의 주인(`owner`)이다. 메인은 파일을 직접 고치지 않고 태스크를 판단해 맡기고, 머지 큐 러너(`hwt mq run`)를 돌린다. 다른 메인의 워크트리에는 send·머지·삭제하지 않는다. 작업 세션은 자기 워크트리만 고치고, 워크트리를 만들거나 지우지 않고, 머지하지 않으며, 주인 메인에게 `hwt tell "[…] …"` 로 결정이 필요한 것만 보낸다 (진행·완료 보고 금지).
- **작업 목록은 hwt 장부(`hwt task`)뿐이다.** 레포 안에 작업 목록 문서(tasks.md 등)를 두지 않는다.
- **워크트리는 `hwt` 로만** 만들고 지운다 (`~/.herdr/worktrees/seedbook/<브랜치>`, `git worktree add`·`EnterWorktree`·`.claude/worktrees/` 금지). 새 워크트리의 dev 포트·DB 는 위 "워크트리 슬롯" 이 나눈다. 동시에 여는 워크트리는 `maxActive: 5` — 넘으면 `hwt new` 가 거부하니 `task decide <id> later --why "maxActive"` 로 두고 하나가 머지되면 시작한다 (`--over-limit` 는 사용자가 원할 때만).
- **작업 세션 이름**: "워크트리 (제목)" 으로 부른다. 제목에 직접 지은 번호(`T14 …`)를 붙이지 않는다 — 태스크와의 연결은 `hwt new … --task-id <id>` 로 한다.
- **사용자가 직접 확인해야 끝나는 일**(가이드·조사·디자인·검토할 문서)은 `hwt new … --hold "<사용자가 확인할 것>"` 로 연다. 작업 세션의 "완료"·"정리해도 됩니다" 는 사용자의 말이 아니다 — 사용자가 말할 때 `hwt hold --release`.
- **태스크 판단** (seedbook 기준, `hwt task decide`): 아래면 `now` 대신 `after:<브랜치>`
  - 둘 다 DB 스키마(`packages/database/src`)·마이그레이션을 바꿈 — drizzle 마이그레이션 번호·스냅샷이 겹친다
  - 둘 다 `apps/web/lib/sync` · `apps/web/server/sync` 를 고침
  - 같은 `/m` 화면 흐름을 고침
  - 둘 다 `CLAUDE.md` · `.claude/rules` 를 고침
- **작업 세션 완료 조건**: 테스트·lint·타입 통과 + QA (자기 슬롯 포트, 개발용 빠른 로그인) → 커밋·push → PR → 열자마자 `hwt mq add --pr <n> "요약"` 하고 턴을 끝낸다. CI·머지·배포를 기다리거나 `gh pr view`·`sleep` 으로 반복 확인하지 않는다 (CI 는 큐가 기다리고, 머지되면 큐가 워크트리를 정리한다). `[리베이스 요청]`·`[머지 반려]`·`[배포 확인 실패]` 가 메시지로 오면 메인에 알리지 않고 같은 워크트리에서 고쳐 다시 `mq add`, `[베이스 반영]` 이 오면 더 커밋하기 전에 `git pull` 한다.
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
- 배포 흐름: 서비스마다 워크플로가 따로 돈다 — `on.push.paths` 로 `deploy-web.yml` 은 `apps/web/**`·`tailwind-config`, `deploy-crawler.yml` 은 `apps/stock-crawler/**` · DB 마이그레이션 (`packages/database/migrations`, `migrate.ts`, `backfill-*`), 공통 (`packages/database/src`·`package.json`, `packages/domain/src`·`package.json`, `typescript-config`, 루트 `package.json`/lockfile, `docker-compose.yml`, `deploy-service.yml`) 은 둘 다. dev 전용 시드 (`packages/database/seed-data`, seed·reset 스크립트)·문서 등은 run 이 생기지 않는다. paths 를 바꾸면 `scripts/check-deploy-lib.mjs` 의 `DEPLOY_WORKFLOWS` 도 같이 바꾼다 (테스트가 확인). concurrency 는 서비스별(`deploy-web`·`deploy-stock-crawler`)이라 서로 취소하지 않고, 같은 서비스끼리 대기 run 이 취소돼도 다음 run 이 최신 코드로 그 서비스 전체를 빌드한다. CI 통과 → 그 서비스 이미지 빌드·push → 서버에서 배포 잠금(`flock`) 안에서 그 서비스의 `WEB_IMAGE_TAG`/`CRAWLER_IMAGE_TAG` 만 새 sha 로 바꾸고 다른 서비스는 `.env` 의 이전 태그를 유지 → `docker compose pull <서비스> && up -d` (태그가 그대로인 서비스는 재시작되지 않음). 수동 실행(`Run workflow`)은 그 서비스를 고른 ref 로 재배포한다. 롤백은 이전 커밋 sha 로 `Run workflow` 또는 서버에서 임시로 `WEB_IMAGE_TAG=<이전 sha> docker compose up -d web`.
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
- 데이터 backfill / 정리 같은 데이터 변경은 마이그레이션에 넣지 않는다. `packages/database/scripts/` 에 멱등 스크립트로 만들고 `package.json` 에 `db:backfill:*` 스크립트로 등록한다 (예: `db:backfill:sync-v2`). 배포 후 `docker compose exec stock-crawler pnpm --filter @seedbook/database db:backfill:<name>` 로 실행.
- 생성 결과가 의도와 다르면 파일을 고치지 말고 `schema.ts` 를 고친 뒤, 아직 배포 전인 해당 마이그레이션(sql + snapshot + journal entry)을 지우고 다시 생성한다.

Local dev: `pnpm docker:dev` 로 인프라(postgres + stock-crawler) 를 띄우고, 별도 터미널에서 `pnpm dev` 로 web 을 호스트에서 실행한다. DB 만 필요하면 `pnpm db:dev:up`. 링크된 워크트리에서는 `pnpm dev` 가 슬롯 포트(4001+10N)와 슬롯 DB(`seedbook_sN`, 없으면 만들고 시드)로 뜬다 (위 "Dev topology" 의 "워크트리 슬롯" 참조).

## Shell Command Rules

**Do not wrap docker/pnpm/git commands in `for` loops** (or any shell construct that starts with a non-excluded keyword like `for`, `while`, `if`). The sandbox decides "inside vs outside" by matching the first token of the command string against `excludedCommands`; a `for` loop starts with `for`, so the whole invocation runs _inside_ the sandbox, and the docker/pnpm/git call inside the loop then hits `operation not permitted` when it tries to reach docker.sock or similar resources. Run each command as a separate Bash call, or chain with `&&` / `;` starting with the excluded keyword (e.g., `docker compose logs ... && docker compose ps`).

## Key Files

- Number formatting: `apps/web/utils/number-format.ts`
- Rebalancing math: `apps/web/features/portfolio/utils/compute-rebalancing-gap.ts`, `linked-portfolio-status.ts`
- Record definitions + schema versions: `packages/domain/src/records/`, `packages/domain/src/version.ts`, `packages/domain/schema-snapshots/`
- Sync client: `apps/web/lib/sync/v2/` (record layer, store ↔ records, sync state, engine, mode switch, backup), `apps/web/lib/sync/record-sync.ts`
- Sync server: `apps/web/server/sync/v2/` (push/pull, version gate, record repo)
- Store storage + mode switching: `apps/web/lib/hybrid-storage.ts`, `apps/web/lib/storage-migration.ts`
