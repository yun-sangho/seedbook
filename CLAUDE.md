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
```

Requires Node >= 22, pnpm 8.

## Architecture

**Monorepo** (Turborepo + pnpm workspaces):
- `apps/web` — Next.js 15 (App Router), React 19, main application
- `packages/` — shared configs (eslint, tailwind, tsconfig), database (Prisma)

**Feature organization** (`apps/web/features/<domain>/`):
- `types/` — interfaces and constants
- `stores/` — Zustand store (one per domain: investments, asset-plan, savings, debts, real-assets, progress)
- `utils/` — calculation logic and helpers (kept out of components for testability)
- `components/` — domain-specific UI

**Cross-feature code** lives in `apps/web/utils/` (plan-comparison-utils, number-format) and `apps/web/components/` (shared UI, chart wrappers).

**State management**: Zustand with localStorage persistence. No immer — use object spreads/shallow copies. Keep derived heavy logic in utils or memoized selectors, not in components.

**All data is client-side** (localStorage). No auth. Prisma/Supabase package exists but is not used in main flows.

## Domain Rules

**Monetary unit**: All amounts are in 만원 (10,000 KRW) internally. Never convert to 원 — use `numberToKorean()` for display formatting only. Double-scaling bugs are a known pitfall.

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

## Key Files

- Projection logic: `apps/web/utils/plan-comparison-utils.ts`
- Chart component: `apps/web/components/investment-plan-comparison-chart.tsx`
- Number formatting: `apps/web/utils/number-format.ts`
- Plan form + live preview: `apps/web/app/asset-plan/page.tsx`
