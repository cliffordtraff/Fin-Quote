# Recommended Claude Skills for Fin Quote

Based on your codebase and the [Simon Willison article on Claude Skills](https://simonwillison.net/2025/Oct/16/claude-skills/), here are skills for **repetitive patterns** you do over and over, not one-time features.

**Key Insight**: Skills should encode patterns you repeat many times (like creating server actions), not one-time feature builds (like implementing insider trading).

---

## High-Priority Repetitive Patterns

### 1. **Server Action Creation** ⭐ MOST REPETITIVE

**Why**: You create server actions constantly - for every new data source, feature, or API integration.

**Location**: `.cursor/skills/create-server-action/SKILL.md` ✅ **ALREADY CREATED**

**What it teaches**:
- `'use server'` directive pattern
- Supabase client creation
- `{ data, error }` return pattern
- Input validation patterns
- Error handling (never throw, always return)
- Try/catch wrapping

**When you use this**:
- "Create a server action for earnings data"
- "Add a server action for analyst ratings"
- "Create a server action for sector data"

**Files showing this pattern**:
- `app/actions/financials.ts`
- `app/actions/prices.ts`
- `app/actions/insider-trading.ts`

---

### 2. **FMP API Integration Pattern** ⭐ VERY REPETITIVE

**Why**: You integrate FMP API endpoints repeatedly (financials, prices, insider trading, market data, sectors, etc.).

**Location**: `.cursor/skills/fmp-api-integration/SKILL.md`

**What it teaches**:
- API key handling from environment variables
- URL construction with query params
- Caching with `next: { revalidate: 300 }`
- Error handling for API failures
- Response validation (check if array, length > 0)
- Data transformation/mapping patterns

**When you use this**:
- "Add FMP endpoint for earnings data"
- "Integrate FMP analyst ratings"
- "Fetch FMP sector performance"

**Files showing this pattern**:
- `app/actions/insider-trading.ts` (FMP v4)
- `app/actions/prices.ts` (FMP price endpoints)
- `app/actions/financials.ts` (FMP financials)

---

### 3. **Supabase Query Patterns** ⭐ REPETITIVE

**Why**: You write Supabase queries with the same patterns repeatedly.

**Location**: `.cursor/skills/supabase-query-patterns/SKILL.md`

**What it teaches**:
- Client creation: `await createServerClient()`
- Basic query structure (from, select, where, order, limit)
- Error checking pattern
- Pagination with `.range()`
- Date filtering (gte, lte)
- Always check `error` before using `data`

**When you use this**:
- "Query the database for earnings data"
- "Add pagination to this query"
- "Filter by date range"

**Files showing this pattern**:
- `app/actions/financials.ts` (lines 11-49)
- All server actions use this pattern

---

### 4. **Error Handling Pattern** ⭐ USED EVERYWHERE

**Why**: You use the `{ data, error }` pattern in every function.

**Location**: `.cursor/skills/error-handling-pattern/SKILL.md`

**What it teaches**:
- Always return `{ data: Type | null; error: string | null }`
- Never throw errors
- Always check `if (error)` or `if ('error' in result)`
- Use try/catch for unexpected errors
- Return error messages, not exceptions

**When you use this**:
- "Add error handling to this function"
- "Fix error handling in this server action"
- "Make this follow our error pattern"

**Files showing this pattern**:
- Every file in `app/actions/`
- Consistent across entire codebase

---

### 5. **TypeScript Interface Creation** ⭐ REPETITIVE

**Why**: You create TypeScript interfaces for every data type and function.

**Location**: `.cursor/skills/typescript-interfaces/SKILL.md`

**What it teaches**:
- Interface naming conventions
- Optional fields with `?`
- Union types for error handling
- Parameter type definitions
- Return type definitions

**When you use this**:
- "Create a TypeScript interface for earnings data"
- "Add types to this function"
- "Define the return type for this server action"

**Files showing this pattern**:
- `app/actions/insider-trading.ts` (InsiderTrade interface)
- `app/actions/prices.ts` (PriceParams, PriceDataPoint)
- `app/actions/financials.ts` (FinancialMetric types)

---

### 6. **Database Migration Creation** ⭐ REPETITIVE

**Why**: You create migrations with the same structure repeatedly.

**Location**: `.cursor/skills/supabase-migrations/SKILL.md`

**What it teaches**:
- File naming: `YYYYMMDDHHMMSS_descriptive_name.sql`
- Idempotency patterns (check before creating)
- Index creation patterns
- Transaction wrapping
- Unique constraint patterns

**When you use this**:
- "Create a migration for the new table"
- "Add indexes for this table"
- "Set up unique constraints"

**Files to reference**:
- `supabase/migrations/` (existing migrations)
- `supabase/migrations/README.md` (patterns)
- `data/MIGRATIONS.md` (tracking)

---

## Medium-Priority Skills

### 6. **React Component Patterns Skill**

**Why**: You have consistent component patterns (client components, server components, data fetching).

**Location**: `.cursor/skills/react-component-patterns/SKILL.md`

**What it teaches**:
- `'use client'` vs server components
- State management patterns (`useState`, `useEffect`)
- Server component data fetching
- Error boundary patterns
- Loading states
- TypeScript prop interfaces
- Component file structure

**Example scenarios**:
- "Create a new table component"
- "Add loading state to this component"
- "Convert this to a server component"

**Files to reference**:
- `components/InsiderTradesTable.tsx` (table pattern)
- `components/InsidersPageClient.tsx` (client component pattern)
- `app/insiders/page.tsx` (server component pattern)

---

### 7. **Chart Generation Skill**

**Why**: You use Highcharts extensively with specific patterns for financial data visualization.

**Location**: `.cursor/skills/chart-generation/SKILL.md`

**What it teaches**:
- Highcharts configuration patterns
- Financial data formatting (currency, percentages)
- Dual Y-axis patterns
- Time series chart patterns
- Chart config generation from data
- Unit detection and formatting

**Example scenarios**:
- "Generate a chart for revenue data"
- "Create a dual-axis chart for revenue and profit"
- "Format currency values in charts"

**Files to reference**:
- `lib/chart-helpers.ts` (chart generation logic)
- `types/chart.ts` (ChartConfig interface)

---

### 8. **Validation & Error Handling Skill**

**Why**: You have specific validation patterns (answer validation, number tolerance, year checking).

**Location**: `.cursor/skills/validation-patterns/SKILL.md`

**What it teaches**:
- Number validation (±2% tolerance)
- Year validation (must exist in data)
- Citation validation (filing dates)
- Severity levels (none, low, medium, high, critical)
- Auto-regeneration patterns
- Error categorization

**Example scenarios**:
- "Add validation for this new metric"
- "Handle validation failures"
- "Categorize validation errors"

**Files to reference**:
- `lib/validators.ts` (validation logic)
- `lib/regeneration.ts` (auto-correction)

---

### 9. **TypeScript Interface Patterns Skill**

**Why**: You have consistent TypeScript patterns for data models and API responses.

**Location**: `.cursor/skills/typescript-patterns/SKILL.md`

**What it teaches**:
- Interface naming conventions
- Optional vs required fields (`?`)
- Union types for error handling
- Type exports and imports
- Generic types where appropriate

**Example scenarios**:
- "Create a TypeScript interface for this data"
- "Add proper types to this function"
- "Follow our TypeScript patterns"

**Files to reference**:
- `app/actions/insider-trading.ts` (InsiderTrade interface)
- `types/chart.ts` (ChartConfig)
- `lib/database.types.ts` (generated types)

---

## Lower-Priority Skills (Nice to Have)

### 10. **Testing Patterns Skill**

**Why**: You have Vitest tests. This skill encodes testing patterns.

**Location**: `.cursor/skills/testing-patterns/SKILL.md`

**What it teaches**:
- Vitest test structure
- Test file naming (`*.test.ts`)
- Mocking patterns
- Test data setup

**Files to reference**:
- `lib/__tests__/validators.test.ts`
- `lib/__tests__/ttm-calculator.test.ts`

---

### 11. **Documentation Patterns Skill**

**Why**: You have extensive docs. This skill ensures new docs follow your format.

**Location**: `.cursor/skills/documentation-patterns/SKILL.md`

**What it teaches**:
- Markdown structure
- Code block formatting
- Table formatting
- File organization in `docs/`

**Files to reference**:
- `docs/INSIDERS-FEATURE.md` (feature docs)
- `docs/Insider Implementation plan.md` (implementation plans)

---

### 12. **GitHub Actions / CI Patterns Skill**

**Why**: You have GitHub Actions for daily data updates.

**Location**: `.cursor/skills/github-actions-patterns/SKILL.md`

**What it teaches**:
- Workflow file structure
- Secret management
- Cron scheduling
- Error handling in workflows

**Files to reference**:
- `.github/workflows/daily-data-update.yml`

---

## Implementation Priority

### Phase 1 (Do First - Most Repetitive)
1. ✅ **Server Action Creation** - **ALREADY CREATED** - You do this constantly
2. **FMP API Integration** - You integrate FMP endpoints repeatedly
3. **Error Handling Pattern** - Used in every function

### Phase 2 (Do Next - Very Repetitive)
4. **Supabase Query Patterns** - Written repeatedly
5. **TypeScript Interface Creation** - Created for every data type
6. **Input Validation Pattern** - Used in every server action

### Phase 3 (Later - Less Frequent)
7. **Database Migration Creation** - When adding new tables
8. **React Component Patterns** - When creating new components
9. **Data Transformation Patterns** - When mapping API responses

---

## Key Insight: Repetitive vs One-Time

**Skills should be for REPETITIVE patterns:**
- ✅ Creating server actions (you do this constantly)
- ✅ Integrating FMP API (you do this for every new data source)
- ✅ Error handling (used in every function)
- ✅ Supabase queries (written repeatedly)
- ✅ TypeScript interfaces (created for every data type)

**Skills should NOT be for ONE-TIME features:**
- ❌ Implementing insider trading (one-time feature build)
- ❌ Building a specific page (one-time implementation)
- ❌ Feature requirements (that's documentation, not a skill)

Think of skills as "how to do X" templates you'll use many times, not "how to build Y feature" guides.

---

## How to Create These Skills

### Quick Start Template

For each skill, create:

```
.cursor/skills/[skill-name]/
└── SKILL.md          # Main instructions
```

### SKILL.md Structure

```markdown
---
name: skill-name
description: Brief description with trigger terms. Use when [repetitive scenarios].
---

# Skill Name

## Quick Template
[Copy-paste template]

## Required Steps
1. Step 1
2. Step 2
3. Step 3

## Common Patterns
[Patterns you repeat]

## Files to Reference
- `path/to/file.ts` - [what it shows]
```

---

## Example: Server Action Skill (Already Created)

See `.cursor/skills/create-server-action/SKILL.md` for a complete example of a repetitive pattern skill.

```markdown
---
name: insider-trading-implementation
description: Implement insider trading features following Fin Quote patterns. Use when working on insider trading features, creating insider-related tables, or implementing insider data ingestion.
---

# Insider Trading Implementation

## Database Schema

### Core Table: `insider_transactions`

Required fields:
- `symbol` (text) - Stock ticker
- `filing_date` (date) - SEC filing date
- `transaction_date` (date) - Actual transaction date
- `reporting_name` (text) - Insider name
- `type_of_owner` (text) - Role (officer, director, etc.)
- `transaction_type` (text) - Code (P, S, M, A, G)
- `securities_transacted` (integer) - Shares
- `price` (numeric, nullable) - Price per share
- `securities_owned` (integer) - Shares owned after
- `link` (text) - SEC EDGAR URL
- `source` (text) - 'FMP' or 'SEC'
- `created_at` (timestamptz)

### Unique Constraint
Prevent duplicates:
```sql
UNIQUE (source, link)
-- OR
UNIQUE (symbol, reporting_name, transaction_date, securities_transacted, price, transaction_type, filing_date)
```

### Indexes
```sql
CREATE INDEX idx_insider_transactions_date ON insider_transactions(transaction_date DESC);
CREATE INDEX idx_insider_transactions_symbol ON insider_transactions(symbol, transaction_date DESC);
CREATE INDEX idx_insider_transactions_name ON insider_transactions(reporting_name, transaction_date DESC);
```

## Server Action Pattern

Follow `app/actions/insider-trading.ts`:

```typescript
'use server'

export async function getInsiderTrades(...): Promise<{ trades: InsiderTrade[] } | { error: string }> {
  // 1. Validate input
  // 2. Create Supabase client
  // 3. Query database
  // 4. Return { trades } or { error }
}
```

## Ingestion Pattern

For cron jobs:
1. Fetch from FMP API (limit 500-2000)
2. Map to InsiderTrade interface
3. Upsert to Supabase (dedupe by unique key)
4. Log results (rows inserted/updated)

See `docs/Insider Implementation plan.md` for full requirements.
```

---

## Benefits of These Skills

1. **Consistency**: All new code follows your patterns
2. **Speed**: Claude doesn't need to learn patterns each time
3. **Quality**: Reduces errors by encoding best practices
4. **Onboarding**: New developers (or you in 6 months) can understand patterns quickly
5. **Maintenance**: Easier to update patterns in one place

---

## Next Steps

1. **Start with #1** (Insider Trading) - You're actively working on this
2. **Add #2** (Supabase Schema) - You'll need it immediately
3. **Add #3** (Server Actions) - Foundation for everything
4. **Iterate**: Add more skills as you identify patterns

Remember: Skills are just Markdown files. Start simple, iterate based on what you need.
