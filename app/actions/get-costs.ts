'use server'

import { createServerClient } from '@/lib/supabase/server'

type QueryLogRow = {
  id: string
  created_at: string
  tool_selected: string
  tool_selection_prompt_tokens?: number | null
  tool_selection_completion_tokens?: number | null
  answer_prompt_tokens?: number | null
  answer_completion_tokens?: number | null
  regeneration_prompt_tokens?: number | null
  regeneration_completion_tokens?: number | null
  embedding_tokens?: number | null
}

// OpenAI Pricing (as of August 2025)
// gpt-5-nano: $0.050 per 1M input tokens, $0.400 per 1M output tokens (60% cheaper than gpt-4o-mini)
// gpt-4o-mini: $0.150 per 1M input tokens, $0.600 per 1M output tokens
// text-embedding-3-small: $0.020 per 1M tokens
const PRICING = {
  'gpt-5-nano': {
    input: 0.050 / 1_000_000, // $ per token
    output: 0.400 / 1_000_000,
  },
  'gpt-4o-mini': {
    input: 0.150 / 1_000_000, // $ per token
    output: 0.600 / 1_000_000,
  },
  'text-embedding-3-small': {
    embedding: 0.020 / 1_000_000,
  },
}

// Get pricing for current model from environment variable
const getCurrentModelPricing = () => {
  const model = process.env.OPENAI_MODEL || 'gpt-5-nano'
  if (model in PRICING && 'input' in PRICING[model as keyof typeof PRICING]) {
    return PRICING[model as 'gpt-5-nano' | 'gpt-4o-mini']
  }
  // Fallback to gpt-5-nano pricing if unknown model
  return PRICING['gpt-5-nano']
}

export type CostStats = {
  total_queries: number
  total_cost_usd: number
  llm_cost_usd: number
  embedding_cost_usd: number
  total_input_tokens: number
  total_output_tokens: number
  total_embedding_tokens: number
  avg_cost_per_query: number
  cost_by_date: Array<{
    date: string
    cost: number
    queries: number
  }>
  cost_by_tool: Array<{
    tool: string
    cost: number
    queries: number
  }>
}

export async function getCostStats(params?: {
  startDate?: string
  endDate?: string
}): Promise<{ data: CostStats | null; error: string | null }> {
  try {
    const supabase = createServerClient()

    // Build date filter
    let query = supabase
      .from('query_logs')
      .select('*')
      .order('created_at', { ascending: false })

    if (params?.startDate) {
      query = query.gte('created_at', params.startDate)
    }
    if (params?.endDate) {
      query = query.lte('created_at', params.endDate)
    }

    const { data: queries, error } = await query

    if (error) {
      console.error('Error fetching cost stats:', error)
      return { data: null, error: error.message }
    }

    const typedQueries: QueryLogRow[] = (queries ?? []) as QueryLogRow[]

    if (typedQueries.length === 0) {
      return {
        data: {
          total_queries: 0,
          total_cost_usd: 0,
          llm_cost_usd: 0,
          embedding_cost_usd: 0,
          total_input_tokens: 0,
          total_output_tokens: 0,
          total_embedding_tokens: 0,
          avg_cost_per_query: 0,
          cost_by_date: [],
          cost_by_tool: [],
        },
        error: null,
      }
    }

    // Calculate totals
    let totalCost = 0
    let llmCost = 0
    let embeddingCost = 0
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let totalEmbeddingTokens = 0
    const costByDate = new Map<string, { cost: number; queries: number }>()
    const costByTool = new Map<string, { cost: number; queries: number }>()

    // Get current model pricing for calculations
    const modelPricing = getCurrentModelPricing()

    for (const query of typedQueries) {
      // Calculate cost for this query
      let queryCost = 0

      // Tool selection cost
      if (query.tool_selection_prompt_tokens && query.tool_selection_completion_tokens) {
        const inputCost = query.tool_selection_prompt_tokens * modelPricing.input
        const outputCost = query.tool_selection_completion_tokens * modelPricing.output
        queryCost += inputCost + outputCost
        llmCost += inputCost + outputCost
        totalInputTokens += query.tool_selection_prompt_tokens
        totalOutputTokens += query.tool_selection_completion_tokens
      }

      // Answer generation cost
      if (query.answer_prompt_tokens && query.answer_completion_tokens) {
        const inputCost = query.answer_prompt_tokens * modelPricing.input
        const outputCost = query.answer_completion_tokens * modelPricing.output
        queryCost += inputCost + outputCost
        llmCost += inputCost + outputCost
        totalInputTokens += query.answer_prompt_tokens
        totalOutputTokens += query.answer_completion_tokens
      }

      // Regeneration cost (if any)
      if (query.regeneration_prompt_tokens && query.regeneration_completion_tokens) {
        const inputCost = query.regeneration_prompt_tokens * modelPricing.input
        const outputCost = query.regeneration_completion_tokens * modelPricing.output
        queryCost += inputCost + outputCost
        llmCost += inputCost + outputCost
        totalInputTokens += query.regeneration_prompt_tokens
        totalOutputTokens += query.regeneration_completion_tokens
      }

      // Embedding cost (for search queries)
      if (query.embedding_tokens) {
        const embCost = query.embedding_tokens * PRICING['text-embedding-3-small'].embedding
        queryCost += embCost
        embeddingCost += embCost
        totalEmbeddingTokens += query.embedding_tokens
      }

      totalCost += queryCost

      // Group by date
      const date = new Date(query.created_at).toISOString().split('T')[0]
      const dateStats = costByDate.get(date) || { cost: 0, queries: 0 }
      dateStats.cost += queryCost
      dateStats.queries += 1
      costByDate.set(date, dateStats)

      // Group by tool
      const tool = query.tool_selected
      const toolStats = costByTool.get(tool) || { cost: 0, queries: 0 }
      toolStats.cost += queryCost
      toolStats.queries += 1
      costByTool.set(tool, toolStats)
    }

    return {
      data: {
        total_queries: typedQueries.length,
        total_cost_usd: totalCost,
        llm_cost_usd: llmCost,
        embedding_cost_usd: embeddingCost,
        total_input_tokens: totalInputTokens,
        total_output_tokens: totalOutputTokens,
        total_embedding_tokens: totalEmbeddingTokens,
        avg_cost_per_query: typedQueries.length > 0 ? totalCost / typedQueries.length : 0,
        cost_by_date: Array.from(costByDate.entries())
          .map(([date, stats]) => ({ date, cost: stats.cost, queries: stats.queries }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        cost_by_tool: Array.from(costByTool.entries())
          .map(([tool, stats]) => ({ tool, cost: stats.cost, queries: stats.queries }))
          .sort((a, b) => b.cost - a.cost),
      },
      error: null,
    }
  } catch (err) {
    console.error('Unexpected error (getCostStats):', err)
    return {
      data: null,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    }
  }
}
