import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkTokenUsage() {
  // Get recent queries with token usage
  const { data: queries, error } = await supabase
    .from('query_logs')
    .select('*')
    .not('tool_selection_total_tokens', 'is', null)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('Error fetching queries:', error)
    return
  }

  console.log(`\n📊 Token Usage Statistics (last ${queries.length} queries)\n`)

  // Calculate averages
  let totalToolSelectionTokens = 0
  let totalAnswerTokens = 0
  let totalRegenerationTokens = 0
  let totalEmbeddingTokens = 0
  let totalOverallTokens = 0
  let queriesWithRegeneration = 0
  let queriesWithEmbeddings = 0

  queries.forEach(q => {
    const toolTokens = q.tool_selection_total_tokens || 0
    const answerTokens = q.answer_total_tokens || 0
    const regenTokens = q.regeneration_total_tokens || 0
    const embedTokens = q.embedding_tokens || 0

    totalToolSelectionTokens += toolTokens
    totalAnswerTokens += answerTokens
    totalRegenerationTokens += regenTokens
    totalEmbeddingTokens += embedTokens
    totalOverallTokens += toolTokens + answerTokens + regenTokens + embedTokens

    if (regenTokens > 0) queriesWithRegeneration++
    if (embedTokens > 0) queriesWithEmbeddings++
  })

  const count = queries.length

  console.log('Average tokens per query:')
  console.log(`  Tool Selection:    ${Math.round(totalToolSelectionTokens / count)} tokens`)
  console.log(`  Answer Generation: ${Math.round(totalAnswerTokens / count)} tokens`)
  console.log(`  Regeneration:      ${Math.round(totalRegenerationTokens / count)} tokens (${queriesWithRegeneration} queries)`)
  console.log(`  Embeddings:        ${Math.round(totalEmbeddingTokens / count)} tokens (${queriesWithEmbeddings} queries)`)
  console.log(`  TOTAL PER QUERY:   ${Math.round(totalOverallTokens / count)} tokens`)

  console.log('\nTotal tokens used:')
  console.log(`  Tool Selection:    ${totalToolSelectionTokens.toLocaleString()} tokens`)
  console.log(`  Answer Generation: ${totalAnswerTokens.toLocaleString()} tokens`)
  console.log(`  Regeneration:      ${totalRegenerationTokens.toLocaleString()} tokens`)
  console.log(`  Embeddings:        ${totalEmbeddingTokens.toLocaleString()} tokens`)
  console.log(`  TOTAL:             ${totalOverallTokens.toLocaleString()} tokens`)

  // Cost estimation (using gpt-5-nano pricing as default)
  // Input: $0.05/1M, Output: $0.40/1M, Embeddings: $0.02/1M
  const avgInputTokens = (totalToolSelectionTokens * 0.8 + totalAnswerTokens * 0.8) / count  // Roughly 80% are input
  const avgOutputTokens = (totalToolSelectionTokens * 0.2 + totalAnswerTokens * 0.2) / count  // Roughly 20% are output
  const avgCostPerQuery = (avgInputTokens / 1000000 * 0.05) + (avgOutputTokens / 1000000 * 0.40) + (totalEmbeddingTokens / count / 1000000 * 0.02)

  console.log('\nEstimated cost (gpt-5-nano pricing):')
  console.log(`  Per query: $${avgCostPerQuery.toFixed(6)}`)
  console.log(`  Per 1000 queries: $${(avgCostPerQuery * 1000).toFixed(2)}`)

  // Breakdown by tool
  console.log('\n📈 Token usage by tool:\n')
  const toolStats = {}

  queries.forEach(q => {
    const tool = q.tool_selected || 'unknown'
    if (!toolStats[tool]) {
      toolStats[tool] = { count: 0, totalTokens: 0 }
    }
    toolStats[tool].count++
    toolStats[tool].totalTokens += (q.tool_selection_total_tokens || 0) + (q.answer_total_tokens || 0) + (q.regeneration_total_tokens || 0) + (q.embedding_tokens || 0)
  })

  Object.entries(toolStats)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([tool, stats]) => {
      console.log(`  ${tool}: ${stats.count} queries, avg ${Math.round(stats.totalTokens / stats.count)} tokens/query`)
    })
}

checkTokenUsage()
