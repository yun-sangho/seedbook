# Code Review and Quality

## Five-Axis Review

Every change is evaluated across these dimensions:

### 1. Correctness
- Matches spec/task requirements
- Edge cases handled (null, empty, boundary values)
- Error paths handled (not just happy path)
- Tests actually test the right things

### 2. Readability & Simplicity
- Names are descriptive and consistent with project conventions
- Control flow is straightforward (no nested ternaries, deep callbacks)
- No "clever" tricks that should be simplified
- Abstractions earn their complexity (don't generalize until 3rd use)
- No dead code: unused variables, backwards-compat shims, `// removed` comments

### 3. Architecture
- Follows existing feature organization (`features/<domain>/types|stores|utils|components`)
- Cross-feature code in `apps/web/utils/` or `apps/web/components/`
- No circular dependencies
- Zustand stores: no immer, use object spreads. Heavy logic in utils, not components.

### 4. Security
- No secrets in code, logs, or version control
- No XSS, injection vulnerabilities
- External data treated as untrusted

### 5. Performance
- No unnecessary re-renders in React components
- Heavy calculations memoized with `useMemo`
- No unbounded loops or unconstrained data operations
- Chart data slicing/projection properly memoized

## Change Sizing

```
~100 lines  -> Good. Reviewable in one sitting.
~300 lines  -> Acceptable if single logical change.
~1000 lines -> Too large. Split it.
```

Separate refactoring from feature work. They are different changes.

## Severity Labels

| Prefix | Meaning | Action |
|--------|---------|--------|
| **Critical:** | Blocks merge | Must fix — security, data loss, broken functionality |
| *(no prefix)* | Required change | Must address before merge |
| **Nit:** | Minor, optional | Author may ignore |
| **Optional:** | Suggestion | Worth considering, not required |
| **FYI** | Informational | No action needed |

## Review Process

1. **Understand context** — What is this change trying to accomplish?
2. **Review tests first** — Tests reveal intent and coverage
3. **Review implementation** — Walk through with five axes
4. **Categorize findings** — Label severity on every comment
5. **Verify the verification** — Tests pass? Build succeeds?

## Dependency Discipline

Before adding any dependency:
1. Does the existing stack solve this?
2. Bundle impact?
3. Actively maintained?
4. Known vulnerabilities? (`npm audit`)
5. License compatible?

Prefer standard library and existing utilities over new dependencies.

## Dead Code Hygiene

After refactoring, check for orphaned code. List it explicitly and confirm before deleting. Don't leave dead code around, but don't silently delete things you're unsure about.
