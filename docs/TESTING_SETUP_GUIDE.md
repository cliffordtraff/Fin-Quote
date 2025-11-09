# Testing Setup Guide for Fin Quote

## Overview

This guide explains how to add automated testing to the Fin Quote codebase. Tests will catch bugs before users see them and give you confidence to refactor code.

**Time to complete**: 2-3 hours for initial setup
**Ongoing effort**: 5-10 minutes per new feature

---

## Why Test This Codebase?

**You're building a financial accuracy system** where wrong answers can cause:
- Users making bad investment decisions based on incorrect data
- Loss of trust and reputation
- Hours debugging production issues

**Three types of quality control you need**:
1. ✅ **Validators** (you have) - Runtime checks on LLM outputs
2. ❌ **Tests** (you need) - Verify YOUR code works correctly
3. ✅ **Evals** (you have) - Measure overall system performance

---

## What to Test (Priority Order)

### **Priority 1: Validators** (CRITICAL)
- File: `lib/validators.ts`
- Why: Core accuracy logic - bugs here = wrong answers to users
- Test coverage goal: 90%+

### **Priority 2: Metric Resolver** (HIGH)
- File: `lib/metric-resolver.ts`
- Why: Maps user phrases to database metrics ("P/E" → `peRatio`)
- Test coverage goal: 90%+

### **Priority 3: Server Actions** (MEDIUM)
- Files: `app/actions/*.ts`
- Why: API boundaries, database interactions
- Test coverage goal: 60%+

### **Priority 4: Chart Helpers** (LOW)
- File: `lib/chart-helpers.ts`
- Why: Data transformation for visualizations
- Test coverage goal: 50%+

---

## Phase 1: Initial Setup (30 minutes)

### Step 1: Install Testing Framework

```bash
# Install vitest (modern, fast test runner)
npm install -D vitest @vitest/ui

# Install testing utilities
npm install -D @testing-library/react @testing-library/jest-dom

# For React component testing (optional, later)
npm install -D @vitejs/plugin-react jsdom
```

### Step 2: Create Vitest Config

Create `vitest.config.ts` in project root:

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './vitest.setup.ts',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
```

### Step 3: Create Setup File

Create `vitest.setup.ts` in project root:

```typescript
import { expect, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers)

// Cleanup after each test
afterEach(() => {
  cleanup()
})
```

### Step 4: Add Test Scripts to package.json

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "test:run": "vitest run"
  }
}
```

### Step 5: Create Test Directory Structure

```bash
mkdir -p lib/__tests__
mkdir -p app/actions/__tests__
mkdir -p components/__tests__
```

---

## Phase 2: Write Critical Tests (1-2 hours)

### Test 1: Number Validator (MOST CRITICAL)

Create `lib/__tests__/validators.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { validateNumbers } from '../validators'

describe('Number Validator', () => {
  describe('Exact matches', () => {
    it('should pass when number matches exactly', () => {
      const answer = 'Revenue was $383.3B in 2024'
      const data = [{ year: 2024, value: 383285000000 }]

      const result = validateNumbers(answer, data)

      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should pass when number is within 2% tolerance', () => {
      const answer = 'Revenue was approximately $385B'
      const data = [{ year: 2024, value: 383285000000 }]

      const result = validateNumbers(answer, data)

      expect(result.isValid).toBe(true)
    })
  })

  describe('Tolerance boundaries', () => {
    it('should reject when number exceeds 2% tolerance', () => {
      const answer = 'Revenue was $400B' // Off by 4.4%
      const data = [{ year: 2024, value: 383285000000 }]

      const result = validateNumbers(answer, data)

      expect(result.isValid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0]).toContain('Mismatch')
    })

    it('should handle numbers at exact tolerance boundary (2%)', () => {
      const answer = 'Revenue was $391.0B' // Exactly 2% higher
      const data = [{ year: 2024, value: 383285000000 }]

      const result = validateNumbers(answer, data)

      expect(result.isValid).toBe(true)
    })
  })

  describe('Multiple numbers', () => {
    it('should validate multiple numbers in one answer', () => {
      const answer = 'Revenue grew from $274.5B in 2020 to $383.3B in 2024'
      const data = [
        { year: 2020, value: 274515000000 },
        { year: 2024, value: 383285000000 }
      ]

      const result = validateNumbers(answer, data)

      expect(result.isValid).toBe(true)
    })

    it('should fail if any number is wrong', () => {
      const answer = 'Revenue was $383.3B and profit was $200B'
      const data = [
        { year: 2024, revenue: 383285000000, profit: 96995000000 }
      ]

      const result = validateNumbers(answer, data)

      expect(result.isValid).toBe(false)
      expect(result.errors[0]).toContain('200B')
    })
  })

  describe('Edge cases', () => {
    it('should handle answer with no numbers', () => {
      const answer = 'No data available'
      const data = []

      const result = validateNumbers(answer, data)

      expect(result.isValid).toBe(true)
    })

    it('should handle very large numbers', () => {
      const answer = 'Market cap is $3.5T'
      const data = [{ value: 3500000000000 }]

      const result = validateNumbers(answer, data)

      expect(result.isValid).toBe(true)
    })

    it('should handle negative numbers', () => {
      const answer = 'Loss was $-5.2B'
      const data = [{ value: -5200000000 }]

      const result = validateNumbers(answer, data)

      expect(result.isValid).toBe(true)
    })

    it('should handle decimal precision correctly', () => {
      const answer = 'ROE is 34.09%'
      const data = [{ value: 34.092882867601105 }]

      const result = validateNumbers(answer, data)

      expect(result.isValid).toBe(true)
    })
  })
})

describe('Year Validator', () => {
  it('should pass when years exist in data', () => {
    const answer = 'Revenue in 2024 was $383.3B'
    const data = [{ year: 2024, value: 383285000000 }]

    const result = validateYears(answer, data)

    expect(result.isValid).toBe(true)
  })

  it('should fail when year is not in data', () => {
    const answer = 'Revenue in 2020 was high'
    const data = [{ year: 2024, value: 383285000000 }]

    const result = validateYears(answer, data)

    expect(result.isValid).toBe(false)
    expect(result.errors[0]).toContain('2020')
  })

  it('should validate multiple years', () => {
    const answer = 'From 2020 to 2024, revenue grew significantly'
    const data = [
      { year: 2020, value: 274515000000 },
      { year: 2024, value: 383285000000 }
    ]

    const result = validateYears(answer, data)

    expect(result.isValid).toBe(true)
  })
})
```

### Test 2: Metric Resolver

Create `lib/__tests__/metric-resolver.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { resolveMetric } from '../metric-resolver'

describe('Metric Resolver', () => {
  describe('Canonical names', () => {
    it('should resolve exact canonical names', () => {
      expect(resolveMetric('peRatio')).toBe('peRatio')
      expect(resolveMetric('returnOnEquity')).toBe('returnOnEquity')
      expect(resolveMetric('freeCashFlow')).toBe('freeCashFlow')
    })
  })

  describe('Common aliases', () => {
    it('should resolve P/E variations', () => {
      expect(resolveMetric('P/E')).toBe('peRatio')
      expect(resolveMetric('PE')).toBe('peRatio')
      expect(resolveMetric('price to earnings')).toBe('peRatio')
      expect(resolveMetric('price-to-earnings')).toBe('peRatio')
    })

    it('should resolve ROE variations', () => {
      expect(resolveMetric('ROE')).toBe('returnOnEquity')
      expect(resolveMetric('return on equity')).toBe('returnOnEquity')
    })

    it('should resolve debt ratio variations', () => {
      expect(resolveMetric('debt to equity')).toBe('debtEquityRatio')
      expect(resolveMetric('D/E')).toBe('debtEquityRatio')
      expect(resolveMetric('leverage ratio')).toBe('debtEquityRatio')
    })

    it('should resolve free cash flow variations', () => {
      expect(resolveMetric('FCF')).toBe('freeCashFlow')
      expect(resolveMetric('free cash flow')).toBe('freeCashFlow')
    })
  })

  describe('Case insensitivity', () => {
    it('should be case insensitive', () => {
      expect(resolveMetric('PERATIO')).toBe('peRatio')
      expect(resolveMetric('roe')).toBe('returnOnEquity')
      expect(resolveMetric('Free Cash Flow')).toBe('freeCashFlow')
    })
  })

  describe('Fuzzy matching', () => {
    it('should handle slight variations', () => {
      expect(resolveMetric('price earnings ratio')).toBe('peRatio')
      expect(resolveMetric('return equity')).toBe('returnOnEquity')
    })
  })

  describe('Unknown metrics', () => {
    it('should return null for unknown metrics', () => {
      expect(resolveMetric('gibberish')).toBeNull()
      expect(resolveMetric('xyz123')).toBeNull()
      expect(resolveMetric('fake metric')).toBeNull()
    })
  })
})
```

### Test 3: Server Actions (Integration Test)

Create `app/actions/__tests__/financials.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import { getAaplFinancialsByMetric } from '../financials'

// Note: These are integration tests that hit real database
// For faster tests, you'd mock the database

describe('getAaplFinancialsByMetric', () => {
  it('should fetch revenue data', async () => {
    const result = await getAaplFinancialsByMetric('revenue', 5)

    expect(result.error).toBeNull()
    expect(result.data).not.toBeNull()
    expect(result.data?.length).toBeLessThanOrEqual(5)

    if (result.data && result.data.length > 0) {
      expect(result.data[0]).toHaveProperty('year')
      expect(result.data[0]).toHaveProperty('value')
      expect(typeof result.data[0].year).toBe('number')
      expect(typeof result.data[0].value).toBe('number')
    }
  })

  it('should respect limit parameter', async () => {
    const result = await getAaplFinancialsByMetric('revenue', 3)

    expect(result.data?.length).toBeLessThanOrEqual(3)
  })

  it('should return data in descending year order', async () => {
    const result = await getAaplFinancialsByMetric('revenue', 5)

    if (result.data && result.data.length > 1) {
      const years = result.data.map(d => d.year)
      const sortedYears = [...years].sort((a, b) => b - a)
      expect(years).toEqual(sortedYears)
    }
  })

  it('should handle invalid metric gracefully', async () => {
    const result = await getAaplFinancialsByMetric('fake_metric' as any, 5)

    // Should either return error or empty data, not crash
    expect(result).toBeDefined()
    expect(result.error || result.data?.length === 0).toBe(true)
  })
})
```

---

## Phase 3: Run Tests

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode (auto-rerun on file changes)
```bash
npm test -- --watch
```

### Run Tests with UI
```bash
npm run test:ui
```

### Run Tests Once (CI/CD)
```bash
npm run test:run
```

### Check Coverage
```bash
npm run test:coverage
```

---

## Phase 4: Development Workflow

### Daily Workflow

**1. Before Making Changes**
```bash
# Ensure all tests pass before starting
npm test
```

**2. While Coding**
```bash
# Run tests in watch mode (auto-rerun on save)
npm test -- --watch
```

**3. After Making Changes**
```bash
# Run all tests to ensure nothing broke
npm test

# If tests pass → safe to commit
git add .
git commit -m "Your changes"
git push
```

**4. If Tests Fail**
```
❌ Test failed: validateNumbers - should reject $400B
→ Fix the code
→ Re-run tests
→ Repeat until all pass ✓
```

### Adding New Features

**1. Write test first (optional but recommended)**
```typescript
it('should handle dividend yield metric', () => {
  const result = resolveMetric('dividend yield')
  expect(result).toBe('dividendYield')
})
```

**2. Run test (it will fail - no code yet)**
```bash
npm test
❌ Expected 'dividendYield' but got null
```

**3. Write code to make test pass**
```typescript
// Add to metric-resolver.ts
if (input === 'dividend yield') return 'dividendYield'
```

**4. Run test again**
```bash
npm test
✓ All tests pass
```

---

## Phase 5: CI/CD Integration (Optional)

### Setup GitHub Actions

Create `.github/workflows/test.yml`:

```yaml
name: Run Tests

on:
  push:
    branches: [main, feature/*]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm run test:run

      - name: Check coverage
        run: npm run test:coverage
```

**What this does**:
- Runs tests automatically on every push
- Blocks merges if tests fail
- Shows test status in GitHub UI

---

## Common Testing Patterns

### Pattern 1: Testing Validation Logic
```typescript
it('should validate X', () => {
  const input = // ... test input
  const expected = // ... expected output

  const result = yourFunction(input)

  expect(result).toBe(expected)
})
```

### Pattern 2: Testing Error Handling
```typescript
it('should handle errors gracefully', () => {
  const badInput = null

  expect(() => yourFunction(badInput)).not.toThrow()
  // OR
  const result = yourFunction(badInput)
  expect(result.error).toBeDefined()
})
```

### Pattern 3: Testing Async Functions
```typescript
it('should fetch data from API', async () => {
  const result = await yourAsyncFunction()

  expect(result.data).toBeDefined()
  expect(result.error).toBeNull()
})
```

### Pattern 4: Testing Edge Cases
```typescript
describe('Edge cases', () => {
  it('should handle empty input', () => {
    expect(yourFunction('')).toBe(null)
  })

  it('should handle null', () => {
    expect(yourFunction(null)).toBe(null)
  })

  it('should handle very large numbers', () => {
    expect(yourFunction(Number.MAX_VALUE)).toBeDefined()
  })
})
```

---

## Test Coverage Goals

### Target Coverage by Priority

| Component | Goal | Why |
|-----------|------|-----|
| Validators | 90%+ | Critical for accuracy |
| Metric Resolver | 90%+ | Critical for routing |
| Server Actions | 60%+ | Important but slower to test |
| Chart Helpers | 50%+ | Less critical |
| UI Components | 30%+ | Manual testing sufficient |

### How to Check Coverage

```bash
npm run test:coverage
```

Output shows:
```
File                  | % Stmts | % Branch | % Funcs | % Lines |
----------------------|---------|----------|---------|---------|
lib/validators.ts     | 92.5    | 88.2     | 100     | 91.8    |
lib/metric-resolver.ts| 87.3    | 85.0     | 95.0    | 86.9    |
app/actions/financials| 65.2    | 60.1     | 70.0    | 64.8    |
```

---

## Troubleshooting

### Tests Fail After Setup

**Problem**: Tests can't find modules
**Solution**: Check `vitest.config.ts` has correct path alias

**Problem**: TypeScript errors in tests
**Solution**: Add to `tsconfig.json`:
```json
{
  "compilerOptions": {
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  }
}
```

### Tests Are Slow

**Problem**: Integration tests hitting database
**Solution**: Mock database calls (advanced, can add later)

**Problem**: Too many tests running
**Solution**: Run specific test file:
```bash
npm test validators
```

---

## When to Write Tests

### Always Test
- ✅ Validators (number, year, filing validation)
- ✅ Metric resolution logic
- ✅ Critical calculations (ratios, percentages)
- ✅ Data transformation logic

### Sometimes Test
- Server actions (if complex logic)
- Chart configuration logic
- Utility functions

### Rarely Test
- Simple getters/setters
- UI components (test manually)
- One-line functions

---

## Maintenance

### Weekly
- Run full test suite: `npm test`
- Check coverage: `npm run test:coverage`

### Monthly
- Review failed tests in CI/CD
- Update tests when requirements change
- Add tests for reported bugs

### Before Major Releases
- Ensure 80%+ coverage on critical code
- Run tests with coverage report
- Fix any flaky tests

---

## Success Metrics

You'll know testing is working when:

1. **You catch bugs before users do**
   - "Test caught that validator bug before I deployed!"

2. **You refactor with confidence**
   - "I cleaned up this messy code, tests still pass ✓"

3. **Deployment is faster**
   - No more "let me manually test 10 scenarios before deploying"

4. **Fewer production bugs**
   - Users report fewer issues
   - Lower time spent debugging

5. **Code quality improves**
   - Tests document expected behavior
   - New developers understand code faster

---

## Next Steps

### Week 1: Foundation
- [ ] Complete Phase 1 (setup)
- [ ] Write 10-15 validator tests
- [ ] Run tests successfully

### Week 2: Expansion
- [ ] Write metric resolver tests
- [ ] Add server action tests
- [ ] Integrate into workflow

### Week 3: Automation
- [ ] Add GitHub Actions CI/CD
- [ ] Set coverage goals
- [ ] Make tests part of code review

### Week 4+: Maintenance
- [ ] Add test for every bug found
- [ ] Add test for every new feature
- [ ] Monitor coverage trends

---

## Resources

### Documentation
- [Vitest Docs](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [Jest DOM Matchers](https://github.com/testing-library/jest-dom)

### Examples
- See test files in this guide
- Check `lib/__tests__/` for real examples
- Review CI/CD workflow in `.github/workflows/`

---

## Getting Help

### Common Questions

**Q: Do I need to test everything?**
A: No. Focus on critical code (validators, metric resolver). 60-80% coverage is great.

**Q: How long should tests take to write?**
A: ~5-10 minutes per new feature. Worth it to catch bugs.

**Q: What if tests slow down development?**
A: Initially yes, but long-term they speed you up (less debugging).

**Q: Can I skip tests for small changes?**
A: Run tests anyway. Small changes often break things unexpectedly.

---

## Conclusion

Testing is **insurance** for your code:
- Most days, you won't need it
- When you need it, you **really** need it
- Cheaper to have it than recover from bugs

**Time investment**: 2-3 hours initial setup + 5 min per feature
**Time saved**: 10+ hours per major bug caught

Start with validator tests (highest ROI), expand from there.
