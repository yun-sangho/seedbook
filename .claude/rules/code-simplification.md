# Code Simplification

## Core Principles

1. **Preserve Behavior Exactly** — Every input-output relationship, error behavior, and side effect must remain identical. Run tests before and after.
2. **Follow Project Conventions** — Align with existing codebase patterns (check CLAUDE.md). Don't impose external preferences.
3. **Prefer Clarity Over Cleverness** — Explicit, readable code beats compact code requiring mental effort.
4. **Maintain Balance** — Don't over-inline, combine unrelated logic, or optimize purely for line count.
5. **Scope to What Changed** — Focus on recently modified code. No drive-by refactors that create diff noise.

## Process

### Understand First (Chesterton's Fence)
Before removing or changing code, understand WHY it exists. Check git history, read tests, identify edge cases. This is especially important for:
- Chart interaction handlers in `investment-plan-comparison-chart.tsx` (complex event handling exists for specific UX reasons)
- Monetary conversion logic (만원/원 migration history)
- Zustand persist migrations

### Identify Patterns
Look for concrete signals:
- Deep nesting (3+ levels)
- Long functions (50+ lines)
- Nested ternaries
- Generic names (`data`, `temp`, `result` without context)
- Duplicated logic across features
- Dead code (unused exports, unreachable branches)

### Apply Incrementally
One change -> run tests -> commit. Never batch multiple simplifications into an untested change.

## Red Flags

- Tests need modification to pass (behavior likely changed)
- The "simplified" result is longer and harder to follow
- Renaming based on personal preference rather than conventions
- Error handling removed for "cleaner" appearance
- Refactoring code you don't fully understand
- Large batched commits mixing simplification with feature work
- Changes outside the current task's scope

## When NOT to Simplify

- Already-clean code
- Code you haven't fully understood yet
- Performance-critical sections (chart rendering, large array projections) where simpler version would be measurably slower
- Code about to be rewritten entirely
- Chart interaction policy code (DO NOT regress — see CLAUDE.md)
