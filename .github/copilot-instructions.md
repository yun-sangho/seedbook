# Copilot Instructions (Seedbook)

Concise guide for AI agents to be productive quickly. Focus on CURRENT patterns; avoid inventing new architectures unless asked.

## 1. Purpose & Domain

Personal asset planning & projection tool (투자/예금/실물/부채). Core feature: compare current aggregated asset value vs projected growth under a user-defined plan (기간, 납입, 목표수익률). Monetary unit internally kept in 원 (KRW). Display uses `numberToKorean()` which converts 원 → 만원 표시 (만원 미만 절삭).

## 2. Architecture Snapshot

Monorepo (Turborepo + pnpm)

- apps/web: Next.js (App Router) main app
- packages/: shared config (eslint, tailwind, tsconfig)
  Key Web Folders:
- app/: route segments (page.tsx, layout.tsx)
- components/: reusable UI (incl. chart container wrappers)
- features/<domain>/: {stores, types, utils, components}
- utils/: cross-feature pure helpers (e.g. plan-comparison-utils, number-format)
- stores/: global slices not tied to a single feature

## 3. Core Data Flow (Projection)

User edits plan form (app/asset-plan/page.tsx) → local derived values (totalMonthlyContribution, averageTargetReturn) → builds a temporary AssetPlan → preparePlanComparisonChartData(investments, plan, range) → chart data (actual historic + future planned). Historic points weekly sampled (getActualInvestmentData). Future projection uses monthly compounding + monthly contribution series.

## 4. Monetary & Calculation Rules

- All entered amounts are in 원 (KRW). `numberToKorean()` converts to 만원 display (만원 미만 절삭).
- Frequency → monthly conversion: 월=x, 분기÷3, 반기÷6, 년÷12.
- Chart Y-axis labels: >=100000000 → 억, >=10000 → 만, else raw.
- Growth rate display: (final - current)/current \* 100 (guard current=0 → 0%).

## 5. Chart Interaction Policy (DO NOT regress)

File: components/investment-plan-comparison-chart.tsx

- Zoom level controlled ONLY by buttons (전체 / 30년 / 10년 / 5년). No wheel/pinch zoom.
- Wheel (while zoom > 1) = horizontal pan (custom scrollPosition state).
- Touch single finger drag = horizontal pan (zoom>1). Pinch disabled.
- All wheel/touch events stopped via passive:false + preventDefault + stopPropagation + stopImmediatePropagation.
- CSS: overscrollBehavior: none; touchAction: none.
  If adding new interactions: preserve scroll isolation and period-based zoom abstraction.

## 6. State Management (Zustand)

- One store per domain (e.g. investments, asset-plan). Keep derived heavy logic outside components (util or memoized selector).
- Avoid immer; mutate via object spreads / shallow copies.

## 7. Testing (Vitest)

Config: apps/web/vitest.config.ts (jsdom, globals). Tests target utils & calculation correctness: plan-comparison-utils.test.ts, number-format.test.ts.
When adding calc logic: add edge cases (0 contribution, high returns, mixed frequencies, long periods). Use file pattern \*_/_.test.ts.

## 8. Conventions & Patterns

- Types: prefer explicit nullable (number | null) for missing series points (Recharts connectNulls=false).
- Plan preview in form: build synthetic AssetPlan (id="preview", createdAt/updatedAt Date objects) for live chart.
- Avoid recomputing large arrays each render; wrap slicing / projection in useMemo.
- Extract magic numeric factors (e.g. zoom ranges, min visible points) to top-level consts if reused.

## 9. Build & Dev Workflows

Top-level scripts (turbo):

- dev: `pnpm dev` (runs next dev etc.)
- build: `pnpm build`
- test (web): `pnpm --filter @seedbook/web test`
- type check: `pnpm check-types`
  Ensure Node >= 22 (see engines). Package manager: pnpm 8.

## 10. Formatting & Lint

- ESLint + Prettier + import sorting plugin + tailwind class sorting.
- Do not disable lint rules unless necessary; explain in comment if you must.

## 11. Adding Features (Checklist)

1. Define types under features/<domain>/types.
2. Create store with minimal surface (CRUD + derived helpers).
3. Add utils for heavy calculations (keep components lean).
4. Add tests for new calculation utilities.
5. Integrate into page/component; memoize derived arrays.
6. Maintain 원 단위 invariants & formatting via numberToKorean.
7. If chart-related, follow interaction policy (Section 5).

## 12. Common Pitfalls (Avoid)

- Double-scaling bugs when formatting (numberToKorean already handles 원→만원 conversion).
- Introducing wheel/pinch zoom back (breaks UX decision).
- Inline anonymous objects/functions causing re-renders (lift & memoize).
- Re-implementing number formatting or monthly conversion logic.

## 13. Key Reference Files

- Projection logic: apps/web/utils/plan-comparison-utils.ts
- Chart component: apps/web/components/investment-plan-comparison-chart.tsx
- Form + live preview: app/asset-plan/page.tsx
- Number formatting: utils/number-format.ts
- Tests: utils/plan-comparison-utils.test.ts, utils/number-format.test.ts

## 14. When Unsure

Search existing utils before adding new ones. Mirror established patterns. If a change conflicts with Section 5 (interaction policy) or Section 4 (monetary rules), surface a clarification request.

---

Provide concise PR descriptions: purpose, high-level changes, validation steps (build + tests). Preserve these conventions unless explicitly directed to refactor.
