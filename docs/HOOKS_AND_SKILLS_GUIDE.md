# Hooks and Skills Guide for Claude Code & Cursor

## What Are Hooks and Skills?

Think of **hooks** and **skills** as ways to teach Claude how to work better with your specific codebase. They're like giving Claude a cheat sheet or instruction manual tailored to your project.

### Skills: Teaching Claude Domain Knowledge

**Skills** are markdown files that teach Claude about:
- Your project's specific patterns and conventions
- Domain knowledge (like financial metrics, SEC filings, etc.)
- How to perform specialized tasks in your codebase
- Best practices for your team

**Where they live:**
- **Personal skills**: `~/.cursor/skills/` (available across all your projects)
- **Project skills**: `.cursor/skills/` (shared with your team in this repo)

### Hooks: Automatic Actions

**Hooks** are scripts that run automatically at specific points in your workflow:
- Before committing code
- After pulling changes
- When creating a new file
- Custom triggers you define

**Where they live:**
- `.cursor/hooks/` directory in your project

---

## Why Use Skills?

Based on your Fin Quote codebase, here are real problems skills could solve:

### Problem 1: Tool Selection Complexity
Your `lib/tools.ts` has complex routing logic for 6 different tools. A new developer (or Claude) might not understand when to use `getFinancialsByMetric` vs `getFinancialMetric`.

**Solution**: Create a skill that teaches Claude the tool selection patterns.

### Problem 2: Financial Domain Knowledge
Your codebase deals with:
- TTM (Trailing Twelve Months) calculations
- Metric aliases ("P/E" → `peRatio`)
- SEC filing types (10-K, 10-Q)
- Financial statement structure

**Solution**: Create a skill that teaches Claude financial terminology and your specific conventions.

### Problem 3: Validation Patterns
Your `lib/validators.ts` has specific validation rules (±2% tolerance, year checking, citation validation). Claude needs to understand these when generating answers.

**Solution**: Create a skill that explains validation requirements.

---

## Example Skills for Your Codebase

### Example 1: Financial Tool Selection Skill

**Location**: `.cursor/skills/financial-tool-selection/SKILL.md`

```markdown
---
name: financial-tool-selection
description: Select the correct financial data tool based on user questions. Use when implementing chatbot features, adding new tools, or debugging tool selection logic.
---

# Financial Tool Selection Guide

## Tool Selection Rules

### When to use `getFinancialsByMetric`:
- User asks for core financials: revenue, net income, assets, liabilities, equity, cash flow, EPS
- User wants basic income statement, balance sheet, or cash flow data
- User asks for calculated ratios: gross margin, ROE, debt-to-equity
- **Symbol**: Must extract from question (e.g., "Apple revenue" → symbol: "AAPL")

### When to use `getFinancialMetric`:
- User asks for advanced metrics: P/E ratio, ROE, debt ratios, growth rates
- User wants any of the 139 extended metrics from `financial_metrics` table
- User asks for valuation metrics, profitability ratios, or efficiency metrics
- **Symbol**: Must extract from question

### When to use `getPrices`:
- User asks about stock price history
- User wants price charts or price trends
- User mentions "price", "stock price", "share price", "trading price"
- **Date calculation**: Convert "last 7 years" to `from: "2017-01-23"` (7 years ago from today)

### When to use `listMetrics`:
- User asks "what metrics are available?"
- User wants to browse available data
- Uncertain which metric name to use

## Symbol Extraction Pattern

Always extract stock symbol from user question:
- "Apple" or "AAPL" → "AAPL"
- "Microsoft" or "MSFT" → "MSFT"
- "Google" or "Alphabet" → "GOOGL"

See `lib/tools.ts` lines 85-100 for complete symbol mapping.

## Period Selection

- Default: `annual` (yearly data)
- Use `quarterly` when user asks for quarterly data or specific quarters
- Use `ttm` for trailing twelve months calculations
```

**Why this helps**: When you ask Claude to "add a new tool for segment data", it will understand your existing tool patterns and follow them.

---

### Example 2: TTM Calculation Skill

**Location**: `.cursor/skills/ttm-calculations/SKILL.md`

```markdown
---
name: ttm-calculations
description: Calculate Trailing Twelve Months (TTM) values from quarterly financial data. Use when working with quarterly data, implementing new metrics, or debugging TTM calculations.
---

# TTM Calculation Guide

## TTM Calculation Types

Based on `lib/ttm-config.ts`, metrics use different TTM methods:

### `sum` - Add last 4 quarters
**Use for**: Flow metrics (revenue, expenses, cash flow)
- Examples: `revenue`, `net_income`, `operating_cash_flow`, `gross_profit`
- Formula: Q1 + Q2 + Q3 + Q4

### `point_in_time` - Use latest quarter
**Use for**: Balance sheet items
- Examples: `total_assets`, `shareholders_equity`, `marketCap`
- Formula: Latest quarter value (no summing)

### `average` - Average of 4 quarters
**Use for**: Efficiency metrics
- Examples: `daysOfInventoryOnHand`, `cashConversionCycle`
- Formula: (Q1 + Q2 + Q3 + Q4) / 4

### `derived` - Recalculate from TTM components
**Use for**: Ratios calculated from other metrics
- Examples: `gross_margin` = (gross_profit TTM) / (revenue TTM)
- Formula: Recalculate using TTM values of components

### `not_applicable` - Cannot be TTM'd
**Use for**: Growth rates, ratios, multi-year metrics
- Examples: `peRatio`, `revenueGrowth`, `cagr`

## Implementation

See `lib/ttm-calculator.ts` for the calculation logic.
Always check `lib/ttm-config.ts` before adding a new metric to determine its TTM type.
```

**Why this helps**: When you ask Claude to "add TTM support for a new metric", it will know which calculation type to use.

---

### Example 3: Validation Requirements Skill

**Location**: `.cursor/skills/answer-validation/SKILL.md`

```markdown
---
name: answer-validation
description: Validate LLM-generated answers for accuracy. Use when implementing validation logic, debugging validation failures, or improving answer quality.
---

# Answer Validation Guide

## Validation Rules

Based on `lib/validators.ts`:

### Number Validation
- **Tolerance**: ±2% for all numeric values
- **Format**: Use exact values from data, format with B/M suffixes (e.g., "$383.3B")
- **Rounding**: Round to 2 decimal places for LLM (see `roundNumbersForLLM` in `ask-question.ts`)

### Year Validation
- All years mentioned in answer must exist in source data
- If user asks "last 5 years" but data only has 4 years, validation fails
- Check `yearBounds` from data before generating answer

### Filing Citation Validation
- Citation dates must match actual filing dates in database
- Check `filings` table for valid filing dates
- Format: "According to the 10-K filed on [date]"

## Severity Levels

- **none**: No issues
- **low**: Minor formatting issues
- **medium**: Triggers auto-regeneration
- **high**: Critical accuracy issues
- **critical**: Must fix before returning answer

## Auto-Regeneration

When validation fails with medium+ severity:
1. Check if data fetch was incomplete (e.g., limit too low)
2. Refetch with corrected args if needed
3. Regenerate answer with `buildRegenerationPrompt`
4. Fall back to original answer if regeneration fails

See `lib/regeneration.ts` for regeneration logic.
```

**Why this helps**: When Claude generates answers, it will understand the validation requirements and generate answers that pass validation.

---

### Example 4: Server Action Patterns Skill

**Location**: `.cursor/skills/server-action-patterns/SKILL.md`

```markdown
---
name: server-action-patterns
description: Follow Next.js server action patterns used in this codebase. Use when creating new server actions, refactoring existing actions, or debugging server-side logic.
---

# Server Action Patterns

## File Structure

All server actions live in `app/actions/`:
- `ask-question.ts` - Main chatbot orchestration
- `financials.ts` - Financial data fetching
- `prices.ts` - Price data fetching
- `filings.ts` - SEC filing metadata
- `search-filings.ts` - Semantic search (currently disabled)

## Required Pattern

```typescript
'use server'

import { createServerClient } from '@/lib/supabase/server'

export async function myAction(params: MyParams) {
  const supabase = createServerClient()
  
  // Validation
  if (!params.symbol) {
    return { error: 'Symbol required' }
  }
  
  // Database query
  const { data, error } = await supabase
    .from('table_name')
    .select('*')
    .eq('symbol', params.symbol)
  
  if (error) {
    return { error: error.message }
  }
  
  return { data }
}
```

## Error Handling

Always return `{ error: string }` for errors, not thrown exceptions.
This allows the UI to handle errors gracefully.

## Data Rounding

Use `roundNumbersForLLM` pattern from `ask-question.ts` when returning data to LLM:
- Round numbers to 2 decimal places
- Keep integers as integers
- Prevents LLM from seeing values like `1.5191298333175105`
```

**Why this helps**: When you ask Claude to "create a new server action for insider trading data", it will follow your existing patterns.

---

## What Are Hooks?

Hooks are scripts that run automatically. They're less about teaching Claude and more about automating tasks.

### Example Hook: Pre-commit Validation

**Location**: `.cursor/hooks/pre-commit.sh`

```bash
#!/bin/bash
# Run before every commit

# Run tests
npm run test:run

# Check for console.logs (should be removed in production)
if git diff --cached --name-only | xargs grep -l "console\.log"; then
  echo "⚠️  Warning: console.log found in staged files"
  echo "Consider removing before committing"
fi

# Check TypeScript
npm run lint
```

**When it runs**: Automatically before you commit code.

---

### Example Hook: Post-pull Data Sync

**Location**: `.cursor/hooks/post-pull.sh`

```bash
#!/bin/bash
# Run after pulling from git

# Check if database migrations were added
if git diff HEAD@{1} HEAD --name-only | grep -q "supabase/migrations"; then
  echo "📦 Database migrations detected"
  echo "Run: npx supabase db reset (if needed)"
fi

# Check if new dependencies were added
if git diff HEAD@{1} HEAD --name-only | grep -q "package.json"; then
  echo "📦 Dependencies changed"
  echo "Run: npm install"
fi
```

**When it runs**: Automatically after you pull changes from git.

---

## How to Create Your First Skill

### Step 1: Choose a Skill Topic

Based on your codebase, good starter skills would be:
1. **Financial tool selection** (most complex logic)
2. **TTM calculations** (specialized domain knowledge)
3. **Server action patterns** (code structure)
4. **Validation requirements** (quality standards)

### Step 2: Create the Directory

```bash
mkdir -p .cursor/skills/financial-tool-selection
```

### Step 3: Create SKILL.md

Create `.cursor/skills/financial-tool-selection/SKILL.md` with:
- YAML frontmatter (name, description)
- Clear instructions
- Examples from your codebase
- References to actual files

### Step 4: Test It

Ask Claude: "When should I use getFinancialsByMetric vs getFinancialMetric?"

Claude should reference your skill and give accurate answers.

---

## Best Practices

### For Skills

1. **Be specific**: Include actual file paths and line numbers
2. **Use examples**: Show real code from your codebase
3. **Keep it concise**: Under 500 lines for SKILL.md
4. **Progressive disclosure**: Put details in separate files if needed
5. **Update regularly**: As your codebase evolves, update skills

### For Hooks

1. **Keep them fast**: Hooks should run quickly
2. **Make them optional**: Don't block critical workflows
3. **Provide clear output**: Tell users what's happening
4. **Handle errors gracefully**: Don't crash on failures

---

## Real-World Workflow Example

### Scenario: Adding a New Financial Metric

**Without skills**: You'd need to explain to Claude:
- Which tool to use
- How TTM calculations work
- Validation requirements
- Server action patterns

**With skills**: You just say "Add support for inventory turnover metric" and Claude:
1. Checks the tool selection skill → knows to use `getFinancialMetric`
2. Checks the TTM skill → knows to use `average` calculation type
3. Checks the server action skill → follows your patterns
4. Checks the validation skill → ensures answers are accurate

---

## Next Steps

1. **Start with one skill**: Pick the most complex part of your codebase (probably tool selection)
2. **Test it**: Ask Claude questions that should trigger the skill
3. **Iterate**: Refine the skill based on Claude's responses
4. **Add more**: Create skills for other complex areas

---

## Summary

- **Skills** = Teaching Claude your domain knowledge and patterns
- **Hooks** = Automating tasks in your workflow
- **Start simple**: Create one skill for your most complex logic
- **Use real examples**: Reference actual files and code from your codebase
- **Keep updating**: Skills should evolve with your codebase

The goal is to make Claude work smarter with your codebase, not harder. Skills help Claude understand your patterns so you don't have to explain them every time.
