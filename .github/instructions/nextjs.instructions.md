---
applyTo: "apps/web/{app,components,features,utils,stores}/\*_/_.{ts,tsx}"
---

## Seedbook Next.js Implementation Guidelines

This section supplements general Copilot instructions with Next.js (App Router) + Zustand + shadcn/ui conventions used in this repo.

### 1. App Router Structure

- Pages live under `apps/web/app/<segment>/page.tsx`; shared layout in `layout.tsx`.
- Mark interactive components with `"use client"` at the top. Keep server boundaries clean: avoid unnecessary client components.
- Co-locate page-only helper components inside a `_components/` folder next to the page when they are not reused globally.
- Avoid heavy calculation inside page components; push into `utils/` or memoized hooks.
- Prefer explicit route segments rather than dynamic catch-alls unless clearly needed.

### 2. Data & Projection Flow (Context)

User form (`app/asset-plan/page.tsx`) → derive `totalMonthlyContribution`, `averageTargetReturn` → build temporary plan object (`id: "preview"`, `Date` objects for timestamps) → `preparePlanComparisonChartData()` → feed chart components.
Keep this flow intact; new projection logic should extend `plan-comparison-utils.ts`, not inline in pages.

### 3. Monetary Rules (Critical)

- All internal numeric inputs already represent 만원 (10,000 KRW). Do NOT scale again internally.
- Monthly conversion: 월=x, 분기÷3, 반기÷6, 년÷12.
- Use `numberToKorean()` for display formatting (억/만 기준). Do not re-implement formatting.

### 4. Zustand State Management

- One store per domain: `features/<domain>/stores/<domain>-store.ts`.
- Do not introduce global monolithic stores.
- Avoid immer; mutate by shallow cloning (`set(state => ({ ...state, field }))`).
- Heavy derived or aggregation logic belongs in pure util functions or memoized selectors, not inline in components.
- Expose the minimal surface (CRUD + required selectors). Avoid leaking internal implementation details.

### 5. shadcn/ui Usage

- Reuse existing primitive wrappers in `components/ui/` (button, input, dialog, select, etc.).
- Styling: prefer Tailwind utility classes; only use inline `style` for dynamic computed values.
- Do not fork shadcn components unless there is a cross-cutting theme requirement—compose instead.
- Maintain accessibility props (e.g., `aria-*` forwarded automatically). Do not strip them.
  - Always pair `Label` with an `htmlFor` that matches the target `Input` `id`. Generate stable IDs (e.g., `${field}-${entity.id}`) rather than random values so hydration matches.
  - When showing inline derived hints (금액 한글 표기 등) visually near an input, wrap the hint in an element with an `id` and reference it via `aria-describedby` on the input so screen readers announce it.
  - Avoid using placeholder as the only label; keep visible Label text.

### 6. Chart Interaction Policy (Must Not Regress)

Primary reference: `components/investment-plan-comparison-chart.tsx`.

- Zoom controlled only via buttons (전체 / 30년 / 10년 / 5년); wheel/pinch zoom disabled.
- Wheel (zoom > 1): horizontal pan via custom `scrollPosition`.
- Touch single-finger drag (zoom > 1): pan. Pinch gestures removed.
- All wheel/touch events: `addEventListener(..., { passive: false })` + `preventDefault` + `stopPropagation` + `stopImmediatePropagation` to isolate from page scroll.
- CSS isolation: `overscrollBehavior: none; touch-action: none;` on the chart container.
  If you add interactions, preserve isolation & button-based zoom abstraction.

### 7. Performance & Memoization

- Slice & filter chart data in a `useMemo` block; minimum derived array recomputation per prop change.
- Avoid generating new object/array literals every render in prop positions (lift + memoize).
- Extract reused numeric constants (min visible points, max zoom) to file-level `const`.

### 8. Testing Conventions

- Utility & projection math: Vitest (`apps/web/vitest.config.ts`) with jsdom + globals.
- Place tests next to or inside `utils/` using `*.test.ts` naming (e.g., `utils/plan-comparison-utils.test.ts`).
- Edge cases to cover when adding logic: zero contributions, zero/very high return, mixed frequencies, long periods.

### 9. File / Code Organization Rules

- Domain structure: `features/<domain>/{types,stores,utils,components}`; keep cross-domain shared logic in `utils/` root.
- Chart-specific helpers live under each feature's `utils/` if domain-specific; otherwise centralize.
- Use explicit nullable (`number | null`) for absent time-series points (Recharts: `connectNulls=false`). Avoid `undefined` for data gaps.

### 10. Adding a New Feature (Practical Checklist)

1. Define domain types under `features/<domain>/types`.
2. Create store with minimal state + actions in `stores/`.
3. Implement heavy calculations in `features/<domain>/utils`.
4. Write tests for new calculation utilities before complex UI integration.
5. Build presentational components in `features/<domain>/components` using existing UI primitives.
6. Memoize derived arrays; avoid recomputation storms.
7. Respect monetary & chart policies (Sections 3 & 6).

### 11. Common Pitfalls to Avoid

- Double-scaling monetary values (만원 → 원 → 만원 다시 등).
- Reintroducing wheel/pinch zoom logic directly inside Recharts component.
- Spreading heavy logic across multiple components instead of a single util.
- Ignoring passive event listener requirements (default passive listeners block `preventDefault`).

### 12. PR & Change Guidance

- PR description should include: purpose, high-level diff bullets, verification (build + key tests green), and mention if chart interaction or monetary logic touched.
- If deviating from interaction or monetary rules, add a justification comment + PR note.

### 13. Quick Commands

```bash
pnpm dev                 # run all dev targets (Next.js app)
pnpm --filter @seedbook/web test   # run web tests
pnpm build               # turbo build all
pnpm check-types         # type check monorepo
```

### 14. When Unsure

Search existing util or store patterns before adding new abstractions. If ambiguity involves monetary units or chart UX, request clarification rather than guessing.

---

These rules keep user-facing financial projections trustworthy and interactions consistent. Follow them unless a documented refactor direction is provided.
