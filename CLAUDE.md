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
pnpm docker:dev                       # Docker Compose dev (postgres + stock-crawler + web)
pnpm docker:dev:down                  # Stop dev stack
pnpm docker:dev:logs                  # Tail dev stack logs
```

Requires Node >= 22, pnpm 8.

### Worktree-aware Docker Dev

`pnpm docker:dev`는 `scripts/docker-dev.sh` 래퍼를 통해 실행된다. 워크트리 디렉토리를 자동 감지하여 `COMPOSE_PROJECT_NAME`과 `WEB_PORT`를 계산하므로, 여러 워크트리에서 동시에 독립된 Docker 스택을 실행할 수 있다.

- main repo: `WEB_PORT=3001`
- worktree: 디렉토리 이름 해시 기반 자동 배분 (3002~3050)
- 수동 오버라이드: `WEB_PORT=3005 pnpm docker:dev`
- Postgres는 호스트에 포트를 노출하지 않는다. DB 접근: `docker compose exec postgres psql -U seedbook`

### DB seed (capture/replay)

`seedbook.Stock` / `seedbook.StockPrice` 초기 데이터는 크롤러가 한 번 돈 뒤 스냅샷 파일로 캡처해 레포에 커밋한다. 하드코딩된 큐레이션 리스트는 쓰지 않는다 — 실 크롤러 산출물이 소스 오브 트루스. (모든 테이블은 `seedbook` 스키마. `public` 은 사용하지 않는다.)

- Fixture 경로: `packages/database/seed-data/{stocks,stock-prices,meta}.json`
- **캡처**: 크롤러가 데이터 채운 뒤 `docker compose exec stock-crawler pnpm --filter @seedbook/database db:seed:capture` 실행. `SEED_PRICE_DAYS` (기본 5) 로 최근 거래일 개수 조정.
- **재생**: `pnpm docker:dev` 기동 시 entrypoint 가 `migrate deploy` 뒤에 자동 실행 (NODE_ENV=development 일 때만). 수동: `pnpm db:seed`.
- 재생은 upsert 라 멱등. 크롤러가 이후 덮어쓰므로 fixture 는 "최소한 이만큼은 있어야 함" 의미. 프로덕션 (`pnpm docker:prod`) 에서는 실행되지 않음.

## Architecture

**Monorepo** (Turborepo + pnpm workspaces):

- `apps/web` — Next.js 15 (App Router), React 19, main application
- `packages/` — shared configs (eslint, tailwind, tsconfig), database (Drizzle ORM)

**Feature organization** (`apps/web/features/<domain>/`):

- `types/` — interfaces and constants
- `stores/` — Zustand store (one per domain: investments, asset-plan, savings, debts, real-assets, progress)
- `utils/` — calculation logic and helpers (kept out of components for testability)
- `components/` — domain-specific UI

**Cross-feature code** lives in `apps/web/utils/` (plan-comparison-utils, number-format) and `apps/web/components/` (shared UI, chart wrappers).

**State management**: Zustand with localStorage persistence. No immer — use object spreads/shallow copies. Keep derived heavy logic in utils or memoized selectors, not in components.

**All data is client-side** (localStorage). No auth. Drizzle/Supabase package exists but is not used in main flows.

## Domain Rules

**Monetary unit**: All amounts are in 원 (KRW) internally. `numberToKorean()` converts 원 → 만원 display (만원 미만 절삭). Stores use Zustand persist `version: 1` with migration from legacy 만원 format.

**Frequency conversion**: 월=x, 분기÷3, 반기÷6, 년÷12.

**Core data flow**: Plan form → derived values (totalMonthlyContribution, averageTargetReturn) → temporary AssetPlan → `preparePlanComparisonChartData()` → chart with historic + future projection.

## Chart Interaction Policy (DO NOT regress)

File: `components/investment-plan-comparison-chart.tsx`

- Zoom: buttons only (전체/30년/10년/5년). **No wheel/pinch zoom.**
- Wheel (zoom > 1) = horizontal pan. Touch single-finger drag = horizontal pan.
- All events stopped via `passive:false` + `preventDefault` + `stopPropagation`.
- CSS: `overscrollBehavior: none; touchAction: none`.

## Testing

Vitest with jsdom and globals. Tests live alongside source as `*.test.ts`. Focus on calculation correctness — edge cases: 0 contribution, high returns, mixed frequencies, long periods.

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
- 배포 흐름: 워크플로 `build` matrix 가 web/crawler 병렬 빌드 → push. `deploy` 가 SSH → `git fetch && reset --hard origin/main` → `IMAGE_TAG=<sha>` 와 다른 env 들을 export → `docker compose pull && up -d`. 롤백은 워크플로 재실행 (이전 커밋 sha 로 `Run workflow`) 또는 서버에서 임시로 `IMAGE_TAG=<이전 sha> docker compose pull && up -d`.
- 수동 재배포: `gh workflow run "Build & Deploy"` 또는 Actions 탭 `Run workflow`.

```bash
pnpm docker:prod                      # 서버: pull 최신 이미지 + restart
docker compose logs web --tail 100    # 서비스 로그
```

The web app builds with `output: 'standalone'` (see `apps/web/next.config.ts`) and runs as a non-root Node process on port `3001` inside the `web` service in `docker-compose.yml`. `apps/web/Dockerfile` follows the same multi-stage pattern as `apps/stock-crawler/Dockerfile` (base → deps → build → production).

**Only use Next.js features that are supported by `output: 'standalone'`.** Do not add functionality that depends on Vercel-only infrastructure.

DB 마이그레이션은 stock-crawler 이미지 entrypoint (`apps/stock-crawler/entrypoint.sh`) 의 `drizzle migrate` (`packages/database/scripts/migrate.ts`) 가 컨테이너 시작 시 자동으로 돌린다. 새 마이그레이션은 `pnpm --filter @seedbook/database db:generate` 로 schema 변경 후 자동 생성. Drizzle 은 단순 SQL apply 라 Supabase 풀러로도 동작하지만, 보수적으로 `DATABASE_URL` 은 direct connection (`db.<ref>.supabase.co:5432`) 을 권장한다.

Local dev: `pnpm docker:dev`로 postgres + stock-crawler + web을 모두 Docker에서 실행. 워크트리별 자동 포트 격리 지원 (위 "Worktree-aware Docker Dev" 참조). 호스트에서 직접 실행하려면 `pnpm dev`.

## Shell Command Rules

**Do not wrap docker/pnpm/git commands in `for` loops** (or any shell construct that starts with a non-excluded keyword like `for`, `while`, `if`). The sandbox decides "inside vs outside" by matching the first token of the command string against `excludedCommands`; a `for` loop starts with `for`, so the whole invocation runs _inside_ the sandbox, and the docker/pnpm/git call inside the loop then hits `operation not permitted` when it tries to reach docker.sock or similar resources. Run each command as a separate Bash call, or chain with `&&` / `;` starting with the excluded keyword (e.g., `docker compose logs ... && docker compose ps`).

## Key Files

- Projection logic: `apps/web/utils/plan-comparison-utils.ts`
- Chart component: `apps/web/components/investment-plan-comparison-chart.tsx`
- Number formatting: `apps/web/utils/number-format.ts`
- Plan form + live preview: `apps/web/app/asset-plan/page.tsx`
