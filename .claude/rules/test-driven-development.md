# Test-Driven Development

## TDD Cycle: RED -> GREEN -> REFACTOR

1. **RED**: Write a failing test first. A test that passes immediately proves nothing.
2. **GREEN**: Write minimal code to make it pass. Don't over-engineer.
3. **REFACTOR**: Clean up with tests green. Run tests after every refactor step.

## Prove-It Pattern (Bug Fixes)

Never start by trying to fix a bug. Start by writing a test that reproduces it.

```
Bug report -> Write reproduction test -> Test FAILS (bug confirmed)
-> Implement fix -> Test PASSES (fix proven) -> Full suite passes (no regressions)
```

## Test Pyramid

- **~80% Unit tests** (pure logic, milliseconds each) — calculation utils, formatters, store logic
- **~15% Integration tests** — component interactions, store + utils integration
- **~5% E2E tests** — critical user flows only

## Writing Good Tests (Vitest)

### Test State, Not Interactions
Assert on outcomes, not internal method calls.

### DAMP Over DRY
Each test should be self-contained and readable like a specification. Duplication is acceptable when it makes tests independently understandable.

### Prefer Real Implementations Over Mocks
Preference: Real implementation > Fake > Stub > Mock. Only mock at boundaries (external APIs, timers).

### Arrange-Act-Assert Pattern
```typescript
it('converts 10000원 to 1만원 display', () => {
  // Arrange
  const amount = 10000;
  // Act
  const result = numberToKorean(amount);
  // Assert
  expect(result).toBe('1만원');
});
```

### One Assertion Per Concept
Separate tests for separate behaviors. Each test verifies one thing.

### Descriptive Names
```typescript
// Good
describe('calculateMonthlyContribution', () => {
  it('returns 0 when no investments exist', ...);
  it('converts quarterly frequency by dividing by 3', ...);
  it('sums across all active investments', ...);
});
```

## Anti-Patterns to Avoid

- Testing implementation details instead of inputs/outputs
- Snapshot abuse on large objects
- Tests that pass on first run without failing first
- Bug fixes without reproduction tests
- Skipping tests to make the suite pass
- Testing framework behavior instead of application behavior

## Seedbook-Specific

- Test files live alongside source as `*.test.ts`
- Run tests: `pnpm --filter @seedbook/web test`
- Focus on calculation correctness in `utils/` (plan-comparison, number-format)
- Edge cases to always cover: 0 contribution, high returns, mixed frequencies, long periods
- Zustand stores: test state transitions and derived values, not React rendering

## Verification Checklist

- [ ] Every new behavior has a corresponding test
- [ ] All tests pass: `pnpm --filter @seedbook/web test`
- [ ] Bug fixes include a reproduction test that failed before the fix
- [ ] Test names describe the behavior being verified
- [ ] No tests were skipped or disabled
