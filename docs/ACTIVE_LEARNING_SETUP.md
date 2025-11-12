# Active Learning Review System - Setup Guide

## Overview

This system allows you to manually review query results, categorize errors, and build a dataset for continuous improvement. This is Phase 1 of the active learning loop.

## Setup Steps

### 1. Run Database Migration

Execute the SQL migration to add review columns to your `query_logs` table:

```sql
-- Run in Supabase SQL Editor
-- File: data/add-review-columns.sql
```

This adds:
- `error_category` - Manual categorization (wrong_tool, wrong_arguments, etc.)
- `reviewer_notes` - Free-form notes about the failure
- `reviewed_at` - Timestamp when reviewed
- `reviewed_by` - User ID of reviewer

### 2. Access the Review Dashboard

Navigate to: `http://localhost:3000/admin/review`

**Note:** This page requires authentication. Make sure you're logged in.

### 3. Using the Review Dashboard

#### Filter Options

- **Unreviewed**: Queries that haven't been manually reviewed yet (default)
- **Thumbs Down**: Queries users explicitly marked as bad
- **No Feedback**: Queries with no user feedback
- **All**: All queries

#### Review Workflow

1. **Browse queries**: Click "Show Details" to see full information
   - User question
   - Tool selected and arguments
   - Answer generated
   - Data returned
   - User feedback (if any)

2. **Click "Review This Query"** to categorize

3. **Select Error Category:**
   - Wrong Tool Selected
   - Wrong Arguments
   - Wrong Units/Formatting
   - Hallucination
   - Correct Data, Wrong Interpretation
   - Missing Data
   - Other

4. **Add Reviewer Notes** (optional but recommended):
   - Why did this fail?
   - What pattern do you see?
   - How should it work instead?

5. **Take Action:**
   - **Mark as Incorrect**: Categorizes the error for analysis
   - **Mark as Correct**: Useful for building positive examples

#### Error Category Summary

The dashboard shows counts of each error category to help you identify the most common patterns.

## Weekly Review Process

### Recommended Schedule

**Monday Morning (30 minutes):**

1. Open the review dashboard
2. Filter to "Thumbs Down" queries from the last week
3. Review and categorize 10-20 queries
4. Note common patterns in a document

**Mid-Week (1-2 hours):**

5. Analyze the most common error category
6. Implement fixes (prompt changes, code fixes, or both)
7. Test fixes manually on failed queries
8. Create regression tests

**Friday:**

9. Deploy fixes
10. Document improvements in `docs/IMPROVEMENTS_LOG.md`

## What to Look For

### Pattern Recognition

When reviewing queries, look for:

1. **Repeated mistakes**: Same type of error across multiple queries
   - Example: "All queries for specific years are failing with limit=1"

2. **Tool selection issues**: Wrong tool being chosen
   - Example: "Price queries getting routed to financials tool"

3. **Argument problems**: Right tool, wrong parameters
   - Example: "10-K queries returning mixed 10-K/10-Q results"

4. **Formatting issues**: Right data, wrong presentation
   - Example: "Numbers showing as 383285000000 instead of $383.3B"

5. **Data gaps**: Missing data that should exist
   - Example: "2020 data exists but system says 'I don't have 2020 data'"

### Example Review Session

```
Week of Nov 1-7:

Reviewed 25 queries with thumbs_down:
- 12 queries: Wrong units (raw numbers instead of B/M formatting)
- 5 queries: Specific year queries failing (limit too small)
- 4 queries: 10-K searches returning 10-Q data
- 4 queries: Misc other issues

Top Priority: Fix unit formatting (affects 48% of failures)

Action Items:
1. Update buildFinalAnswerPrompt to require B/M formatting
2. Test on the 12 failed queries
3. Create regression test
4. Deploy by Friday
```

## Building Your Dataset

As you review queries, you're building two valuable datasets:

### 1. Negative Examples (Errors to Avoid)

Queries marked as incorrect with categories help you:
- Identify weak points in your system
- Build regression tests
- Track improvement over time

### 2. Positive Examples (Correct Patterns)

Queries marked as correct help you:
- Document what "good" looks like
- Build few-shot examples for prompts
- Validate that fixes don't break working queries

## Next Steps

After collecting 2-3 weeks of categorized data:

1. **Build regression test suite** from reviewed queries
2. **Implement fixes** for top error categories
3. **Track metrics** (accuracy over time)
4. **Automate pattern detection** with analysis scripts

## Best Practices

1. **Be consistent**: Use the same categories for similar errors
2. **Add notes**: Future you will thank you for context
3. **Review regularly**: Weekly reviews catch patterns early
4. **Start small**: Review 10-20 queries per week, not everything
5. **Focus on patterns**: Don't fix one-off issues, fix categories
6. **Document fixes**: Track what you changed and why
7. **Test thoroughly**: Verify fixes work on old failed queries

## Metrics to Track

Create a simple spreadsheet to track:

- Week number
- Total queries reviewed
- Top 3 error categories
- Number of each category
- Fixes implemented
- Overall thumbs_up rate

Example:
```
Week 1: 20 reviewed, top: wrong_units (8), wrong_args (6), wrong_tool (4)
Week 2: 25 reviewed, top: wrong_units (3), wrong_args (8), hallucination (5)
        → Fixed units issue, reduced from 8 to 3!
Week 3: ...
```

## Troubleshooting

### Can't access /admin/review page

- Make sure you're logged in (authentication required)
- Check that you ran the database migration
- Verify the page loads without errors in console

### Queries not showing up

- Check your filter selection
- Verify queries exist in database: `SELECT COUNT(*) FROM query_logs`
- Check that dev server is running

### Review action not working

- Check browser console for errors
- Verify Supabase connection
- Ensure database migration was run successfully

## Future Enhancements

Phase 1 (Current): Manual review dashboard

Phase 2 (Next):
- Automated pattern detection scripts
- Regression test suite
- Metrics dashboard

Phase 3 (Future):
- A/B testing framework
- Prompt versioning
- Automated fixes suggestions
