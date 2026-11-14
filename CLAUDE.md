# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
pnpm dev                              # Start dev server (Next.js on :3001 with turbopack)
pnpm build                            # Production build (runs format:check first)
pnpm lint                             # ESLint (max-warnings 0)
pnpm check-types                      # TypeScript type checking
pnpm format                           # Prettier + import sort + tailwind class sort
pnpm --filter @seedbook/web test      # Run Vitest tests
pnpm --filter @seedbook/web test:watch
pnpm --filter @seedbook/web test:db   # DB integration tests (*.db.test.ts) — needs `pnpm db:dev:up`
pnpm docker:dev                       # Dev infra in Docker (postgres + stock-crawler)
pnpm docker:dev:down                  # Stop dev stack
pnpm docker:dev:logs                  # Tail dev stack logs
pnpm db:dev:up                        # Postgres only (lighter — skip stock-crawler)
pnpm db:dev:down                      # Stop postgres only
```

Requires Node >= 22, pnpm 8.

### Dev topology

Web 은 **호스트에서** `pnpm dev` 로 직접 띄운다 (Next.js + turbopack, port 3001). Docker 안에서는 `postgres` + `stock-crawler` 만 띄운다 — Docker for Mac (VirtioFS) 의 bind mount fs-event 전파 이슈로 컨테이너 내부 turbopack HMR 이 변경을 자주 놓치기 때문.

- 호스트 `pnpm dev` → `localhost:3001` 에서 서비스
- 컨테이너 postgres → `127.0.0.1:5432` 노출, 호스트 dev 가 그대로 접속
- DB 접근: `docker compose -f docker-compose.dev.yml exec postgres psql -U seedbook`

### DB seed (capture/replay)

`seedbook.Stock` / `seedbook.StockPrice` 초기 데이터는 크롤러가 한 번 돈 뒤 스냅샷 파일로 캡처해 레포에 커밋한다. 하드코딩된 큐레이션 리스트는 쓰지 않는다 — 실 크롤러 산출물이 소스 오브 트루스. (모든 테이블은 `seedbook` 스키마. `public` 은 사용하지 않는다.)

- Fixture 경로: `packages/database/seed-data/{stocks,stock-prices,meta}.json`
- **캡처**: 크롤러가 데이터 채운 뒤 `docker compose exec stock-crawler pnpm --filter @seedbook/database db:seed:capture` 실행. `SEED_PRICE_DAYS` (기본 5) 로 최근 거래일 개수 조정.
- **재생**: `pnpm docker:dev` 기동 시 entrypoint 가 `migrate deploy` 뒤에 자동 실행 (NODE_ENV=development 일 때만). 수동: `pnpm db:seed`.
- 재생은 upsert 라 멱등. 크롤러가 이후 덮어쓰므로 fixture 는 "최소한 이만큼은 있어야 함" 의미. 프로덕션 (`pnpm docker:prod`) 에서는 실행되지 않음.

dev 사용자(`dev-user-v1`)의 계좌·포트폴리오는 **테스트 시나리오 픽스처** `packages/database/seed-data/user-data.json` (관리 화면 백업 2.0 모양) 이다. 목표에 가까운 계좌 / 크게 벗어난 계좌 / 포트폴리오 밖 종목을 가진 계좌 / 예수금만 있는 계좌 / 연결 안 된 계좌 / 계좌 없는 포트폴리오를 담는다.

- 같은 파일이 관리 화면 "데모 데이터" (`apps/web/public/seed-data/user-data.json`) 로도 쓰인다 — 두 파일은 같아야 한다 (`features/settings/utils/demo-data.test.ts` 가 정합성을 검사).
- 시드는 dev 사용자에게 계좌·포트폴리오가 없을 때만 넣는다. **테스트 전에 시나리오로 되돌리려면 `pnpm db:seed:reset`** (postgres 가 떠 있어야 함). 리밸런싱·설정까지 지우고 시나리오로 바꾸며, 동기화 엔티티는 톰스톤으로 남겨 cloud 모드 브라우저에도 반영된다. local 모드 브라우저는 관리 화면 "데모 데이터" 로 넣는다.
- 픽스처 수량은 stock 시드의 가격으로 맞췄다. stock 시드를 다시 캡처하면 시나리오의 이격이 달라질 수 있으니 함께 확인한다.

## Architecture

**Monorepo** (Turborepo + pnpm workspaces):

- `apps/web` — Next.js 15 (App Router), React 19, main application
- `packages/` — shared configs (eslint, tailwind, tsconfig), database (Drizzle ORM)

**Service scope**: 투자 (계좌·보유 종목), 포트폴리오 (목표 비중), 리밸런싱 세 가지만 다룬다. 이 셋을 먼저 확실히 만든 뒤 도메인을 하나씩 넓힌다. (저축·대출·실물자산·자산 계획·자산 기록은 2026-11 제거됨 — DB 테이블은 아직 남아 있고 별도로 삭제 예정.)

**Feature organization** (`apps/web/features/<domain>/`):

- `types/` — interfaces and constants
- `stores/` — Zustand store (one per domain: investments, portfolio, rebalancing)
- `utils/` — calculation logic and helpers (kept out of components for testability)
- `components/` — domain-specific UI

**Cross-feature code** lives in `apps/web/utils/` (number-format, monthly-summary-utils) and `apps/web/components/` (shared UI, chart wrappers).

**State management**: Zustand with localStorage persistence. No immer — use object spreads/shallow copies. Keep derived heavy logic in utils or memoized selectors, not in components.

**Storage & sync**: 로그인(카카오) 필수. 저장소 모드는 사용자가 고른다 — `local` (이 브라우저에만) / `cloud` (서버 동기화). 모드 전환은 덮어쓰지 않고 양쪽을 합친다 (`lib/storage-merge.ts`, 같은 항목은 로컬 우선). cloud 모드에서는:

- 엔티티 동기화로 옮긴 store (`lib/sync/managed-stores.ts`, 현재 리밸런싱) 는 `/api/sync/mutations` · `/api/sync/pull` 로 바뀐 항목만 주고받는다. 자산은 본인만 수정하므로 **마지막 저장이 이긴다** (version 은 pull 중복 제거용). 삭제는 톰스톤(`deletedAt`). 로컬 변경은 저장 어댑터(`lib/hybrid-storage.ts` → `lib/sync/local-change-recorder.ts`)가 저장될 때마다 대기열에 기록하고, `EntitySyncRunner` 가 전송한다.
- 나머지 store 는 도메인 단위 envelope (`/api/storage/[key]` → `_translators/`) 로 저장한다.
- 도메인을 엔티티 동기화로 옮길 때: 서버 `server/<domain>/` (record + `createEntityRepo`) 를 만들고 `server/sync/registry.ts` 의 `SYNC_ENTITIES`, 클라이언트 `features/<domain>/sync/` 설정을 `managed-stores.ts` · `synced-stores.ts` 에 등록한다. 테이블엔 `syncColumns()` 추가 (마이그레이션은 drizzle-kit 생성만).

## Domain Rules

**Monetary unit**: All amounts are in 원 (KRW) internally. `numberToKorean()` converts 원 → 만원 display (만원 미만 절삭). Stores use Zustand persist `version: 1` with migration from legacy 만원 format.

**Portfolio links**: 한 계좌는 최대 하나의 포트폴리오에만 연결된다 (`features/portfolio/utils/portfolio-links.ts`, 서버 `investment_account.portfolioId`).

## Testing

Vitest with jsdom and globals. Tests live alongside source as `*.test.ts`. Focus on calculation correctness (valuation, rebalancing gaps, sync state transitions) and edge cases (empty holdings, missing prices, cash-only accounts).

DB integration tests (`*.db.test.ts`, e.g. storage translators) run against real Postgres via `test:db` (`vitest.db.config.ts`), and are excluded from the default `test` run. They use a separate `seedbook_test` database on the local dev postgres (override with `TEST_DATABASE_URL`; the name must end in `_test`). Global setup applies the drizzle migrations; each test creates its own user via `openTestDb().createTestUser()` and rows are cleaned up by cascade.

### QA (구현 완료 후 필수)

구현이 끝나면 테스트 통과와 별개로 **ego-lite 브라우저(`ego-browser` 스킬)로 로컬 환경에서 직접 QA 한다.** 호스트에서 `pnpm dev` (+ 필요하면 `pnpm db:dev:up` / `pnpm docker:dev`) 로 띄운 `localhost:3001` 에 접속해 바뀐 화면·흐름을 실제로 조작하고 결과를 확인한다. 모바일 화면(`/m/...`)을 바꿨다면 모바일 뷰포트로 확인한다. QA 하지 못했다면 (로그인 불가, 데이터 없음 등) 그 사실과 이유를 명시한다.

## Conventions

- Types: prefer explicit nullable (`number | null`) for missing chart points (Recharts `connectNulls=false`)
- Memoize slicing/projection in `useMemo` to avoid recomputing large arrays each render
- Extract magic numeric factors to top-level consts if reused
- Search existing utils before adding new ones; mirror established patterns
- Do not disable lint rules unless necessary; explain in comment if you must

## Deployment

Self-hosted Docker Compose + Caddy 리버스 프록시 + Supabase managed Postgres.

- 프로덕션 `docker-compose.yml` 에는 **postgres 가 포함되지 않는다.** DB는 Supabase managed Postgres. connection string은 GitHub Secret `DATABASE_URL` 로 보관 (자세한 가이드는 `.env.example` 참고).
- **런타임 env 는 GitHub Secrets/Variables 에 보관**한다. 서버에는 `.env.local`/git checkout 둘 다 두지 않으며, `deploy` job 이 SSH 세션에 export 해 docker compose 가 shell env 로 치환하도록 한다.
  - **Secrets (7)**: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`.
  - **Variables**: `BETTER_AUTH_URL` (필수, 예: `https://seedbook.boogie.ing`), `DEPLOY_PATH` (기본 `~/seedbook` — deployer 홈 아래라 sudo 없이 생성됨), `DEPLOY_PORT` (기본 22), `WEB_PORT` (기본 `127.0.0.1:3001`), `CRON_MORNING`/`CRON_AFTERNOON` (선택).
- 이미지는 GitHub Actions (`.github/workflows/deploy.yml`) 가 main push 마다 GHCR (`ghcr.io/<owner>/<repo>/{web,stock-crawler}`) 에 `latest` + `<sha>` 두 태그로 푸시한다. 서버는 빌드하지 않고 pull 만 한다.
- CI (`.github/workflows/ci.yml`): PR 마다, 그리고 main push 때 배포 워크플로의 첫 단계로 깨끗한 checkout 에서 format · lint · 타입 · 단위 테스트 · DB 통합 테스트(postgres 서비스) · `next build` 를 돌린다. 실패하면 이미지 빌드/배포로 넘어가지 않는다.
- 배포 흐름: `changes` job 이 바뀐 경로로 빌드 대상을 고른다 — `apps/web/**` → web, `apps/stock-crawler/**` · DB 마이그레이션 (`packages/database/migrations`, `migrate.ts`, `backfill-*`) → crawler, 공통 (`packages/database/src`·`package.json`, `typescript-config`, 루트 `package.json`/lockfile, `deploy.yml`) → 둘 다, dev 전용 시드 (`packages/database/seed-data`, seed·reset 스크립트) → 빌드 안 함, `docker-compose.yml` 만 → 빌드 없이 재배포, 그 외 (문서 등) → 아무것도 안 함. 수동 실행(`Run workflow`)은 항상 둘 다. CI 통과 → 고른 이미지만 빌드·push → `deploy` 가 빌드한 서비스의 `WEB_IMAGE_TAG`/`CRAWLER_IMAGE_TAG` 만 새 sha 로 바꾸고 나머지는 서버 `.env` 의 이전 태그를 유지 → `docker compose pull && up -d` (태그가 그대로인 서비스는 재시작되지 않음). 롤백은 워크플로 재실행 (이전 커밋 sha 로 `Run workflow`) 또는 서버에서 임시로 `WEB_IMAGE_TAG=<이전 sha> docker compose up -d web`.
- 수동 재배포: `gh workflow run "Build & Deploy"` 또는 Actions 탭 `Run workflow`.

```bash
pnpm docker:prod                      # 서버: pull 최신 이미지 + restart
docker compose logs web --tail 100    # 서비스 로그
```

The web app builds with `output: 'standalone'` (see `apps/web/next.config.ts`) and runs as a non-root Node process on port `3001` inside the `web` service in `docker-compose.yml`. `apps/web/Dockerfile` follows the same multi-stage pattern as `apps/stock-crawler/Dockerfile` (base → deps → build → production).

**Only use Next.js features that are supported by `output: 'standalone'`.** Do not add functionality that depends on Vercel-only infrastructure.

DB 마이그레이션은 stock-crawler 이미지 entrypoint (`apps/stock-crawler/entrypoint.sh`) 의 `drizzle migrate` (`packages/database/scripts/migrate.ts`) 가 컨테이너 시작 시 자동으로 돌린다. 새 마이그레이션은 `pnpm --filter @seedbook/database db:generate` 로 schema 변경 후 자동 생성. Drizzle 은 단순 SQL apply 라 Supabase 풀러로도 동작하지만, 보수적으로 `DATABASE_URL` 은 direct connection (`db.<ref>.supabase.co:5432`) 을 권장한다.

**마이그레이션 규칙 (반드시 지킬 것):**

- `packages/database/migrations/` 의 파일은 **오직 `db:generate` (drizzle-kit) 로만 생성**한다. 마이그레이션 SQL 을 직접 작성하거나, 생성된 파일에 SQL 을 추가·수정하지 않는다 (`meta/` 스냅샷·journal 포함).
- 데이터 backfill / 정리 같은 데이터 변경은 마이그레이션에 넣지 않는다. `packages/database/scripts/` 에 멱등 스크립트로 만들고 `package.json` 에 `db:backfill:*` 스크립트로 등록한다 (예: `db:backfill:account-portfolio`). 배포 후 `docker compose exec stock-crawler pnpm --filter @seedbook/database db:backfill:<name>` 로 실행.
- 생성 결과가 의도와 다르면 파일을 고치지 말고 `schema.ts` 를 고친 뒤, 아직 배포 전인 해당 마이그레이션(sql + snapshot + journal entry)을 지우고 다시 생성한다.

Local dev: `pnpm docker:dev` 로 인프라(postgres + stock-crawler) 를 띄우고, 별도 터미널에서 `pnpm dev` 로 web 을 호스트에서 실행한다. DB 만 필요하면 `pnpm db:dev:up`. 워크트리별 자동 격리 지원 (위 "Dev topology" 참조).

## Shell Command Rules

**Do not wrap docker/pnpm/git commands in `for` loops** (or any shell construct that starts with a non-excluded keyword like `for`, `while`, `if`). The sandbox decides "inside vs outside" by matching the first token of the command string against `excludedCommands`; a `for` loop starts with `for`, so the whole invocation runs _inside_ the sandbox, and the docker/pnpm/git call inside the loop then hits `operation not permitted` when it tries to reach docker.sock or similar resources. Run each command as a separate Bash call, or chain with `&&` / `;` starting with the excluded keyword (e.g., `docker compose logs ... && docker compose ps`).

## Key Files

- Number formatting: `apps/web/utils/number-format.ts`
- Rebalancing math: `apps/web/features/portfolio/utils/compute-rebalancing-gap.ts`, `linked-portfolio-status.ts`
- Sync client: `apps/web/lib/sync/` (core state transitions, engine, change recorder, managed/synced store registries)
- Sync server: `apps/web/server/sync/` (registry, shared entity repo, mutations/pull)
- Envelope storage + mode switching: `apps/web/lib/hybrid-storage.ts`, `apps/web/lib/storage-migration.ts`, `apps/web/app/api/storage/`
