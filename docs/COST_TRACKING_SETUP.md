# API Cost Tracking Setup

This document outlines the steps to enable API cost tracking for OpenAI usage.

## Overview

The cost tracking system monitors all OpenAI API usage including:
- **LLM Calls** (gpt-4o-mini): Tool selection, answer generation, regeneration
- **Embeddings** (text-embedding-3-small): Vector search queries

## Setup Steps

### 1. Run Database Migration

Execute the SQL migration to add cost tracking columns:

```sql
-- Location: data/add-cost-tracking.sql
```

**Option A: Via Supabase Dashboard**
1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `data/add-cost-tracking.sql`
4. Click "Run"

**Option B: Via Command Line** (if you have psql installed)
```bash
psql $DATABASE_URL < data/add-cost-tracking.sql
```

### 2. Verify Implementation

The following files have been updated to track token usage:

- ✅ `app/actions/ask-question.ts` - Captures token usage from all LLM calls
- ✅ `app/actions/get-costs.ts` - Server action to fetch and calculate costs
- ✅ `app/admin/costs/page.tsx` - Admin dashboard to display costs
- ✅ `data/add-cost-tracking.sql` - Database schema changes

### 3. Access the Cost Dashboard

Once the migration is complete, visit:
```
http://localhost:3000/admin/costs
```

## Features

### Cost Dashboard Shows:
- Total API costs (LLM + embeddings)
- Cost breakdown by tool
- Daily cost trends
- Token usage statistics
- Average cost per query

### Pricing (as of 2024):
- **gpt-4o-mini**: $0.150 per 1M input tokens, $0.600 per 1M output tokens
- **text-embedding-3-small**: $0.020 per 1M tokens

## Database Schema

New columns added to `query_logs` table:

```sql
-- Tool selection tokens
tool_selection_prompt_tokens INTEGER
tool_selection_completion_tokens INTEGER
tool_selection_total_tokens INTEGER

-- Answer generation tokens
answer_prompt_tokens INTEGER
answer_completion_tokens INTEGER
answer_total_tokens INTEGER

-- Regeneration tokens (if applicable)
regeneration_prompt_tokens INTEGER
regeneration_completion_tokens INTEGER
regeneration_total_tokens INTEGER

-- Embedding tokens (for search queries)
embedding_tokens INTEGER

-- Calculated total cost in USD
total_cost_usd NUMERIC(10, 6)
```

## Future Enhancements

### TODO: Add embedding tracking to search-filings.ts

The search-filings action uses embeddings but doesn't currently track token usage. To complete the implementation:

1. Update `app/actions/search-filings.ts`:
   - Capture `usage.total_tokens` from embedding response
   - Return embedding token count in the response

2. Update `app/actions/ask-question.ts`:
   - Capture embedding tokens from searchFilings result
   - Set `embeddingTokens` variable

Example:
```typescript
// In search-filings.ts
const embeddingResponse = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: query,
})

const embeddingTokens = embeddingResponse.usage?.total_tokens || 0

// Return in response
return {
  data: passages,
  error: null,
  embeddingTokens // Add this field
}
```

## Monitoring

### Key Metrics to Watch:
- **Total Cost per Day**: Track spending trends
- **Cost per Query**: Optimize expensive queries
- **Token Usage**: Identify prompts that use excessive tokens

### Optimization Tips:
1. **Reduce prompt length**: Shorter prompts = lower costs
2. **Limit conversation history**: Only include relevant messages
3. **Optimize regeneration**: Reduce validation failures
4. **Monitor embedding usage**: Track search query frequency

## Troubleshooting

### Migration fails:
- Check that you have the correct database permissions
- Verify the `query_logs` table exists
- Ensure no conflicting column names

### Costs showing as $0:
- Verify the migration ran successfully
- Check that new queries are capturing token usage
- Look for `usage` property in OpenAI responses

### Dashboard shows "Error loading cost data":
- Check browser console for errors
- Verify Supabase connection
- Check server logs for API errors

## Questions?

If you encounter issues, check:
1. Database migration completed successfully
2. Token usage is being captured (check logs)
3. Cost calculations are correct (verify pricing)
