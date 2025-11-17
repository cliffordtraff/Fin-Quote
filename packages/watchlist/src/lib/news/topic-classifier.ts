/**
 * Topic Classification Service
 *
 * Classifies news articles into topics using OpenAI GPT-4o-mini.
 * Features:
 * - Batch classification (20-30 articles per API call)
 * - Idempotency via content hash
 * - Feed-level topic extraction
 * - Graceful fallback hierarchy
 * - Classification metadata storage
 */

import crypto from 'crypto'
import OpenAI from 'openai'
import { NewsArticle, TopicClassificationMetadata } from '@watchlist/types'
import {
  Topic,
  TOPICS,
  TOPIC_VERSION,
  canonicalizeTopics,
  getFeedTopic
} from '@watchlist/config/topics'

// Initialize OpenAI client
let openai: OpenAI | null = null

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('OPENAI_API_KEY not set, topic classification will use fallback')
    return null
  }

  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
  }

  return openai
}

/**
 * Generate idempotency key for an article
 * Uses MD5 hash of headline + description + source
 */
export function generateIdempotencyKey(article: NewsArticle): string {
  const content = `${article.headline}|${article.description}|${article.source}`
  return crypto.createHash('md5').update(content).digest('hex')
}

/**
 * Estimate token count for a string (rough approximation)
 * Uses ~4 characters per token heuristic
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Build classification prompt with articles batch
 */
function buildClassificationPrompt(articles: ArticleForClassification[]): string {
  const articlesForGPT = articles.map(a => ({
    id: a.id,
    headline: a.headline,
    description: a.description,
    feedTopic: a.feedTopic,
    tickers: a.matchedTickers?.map(t => t.symbol)
  }))

  const articlesJSON = JSON.stringify(articlesForGPT, null, 2)

  return `You are a financial news topic classifier. Classify each article into 1-3 relevant topics AND determine its scope.

TOPICS:
${TOPICS.join(', ')}

DISAMBIGUATION RUBRIC:
- Fed Policy vs Economy: Use Fed Policy ONLY when Federal Reserve is the primary actor
- Technology vs Crypto: Use Crypto for blockchain/digital assets, Technology for other tech
- Energy vs Commodities: Energy for oil/gas/renewables, Commodities for metals/agriculture
- Banking vs Business: Banking for financial institutions, Business for general corporate

SCOPE CLASSIFICATION (NEW):
Determine if the article is about a market-wide event or company-specific:

- "macro": Market-wide event affecting most stocks
  Examples: Tariffs, Fed rate decisions, wars, major economic data (CPI, jobs), geopolitical crises, financial system stress

- "company": Specific company news
  Examples: Earnings reports, M&A, product launches, executive changes, lawsuits (single company)

- "sector": Industry-level news
  Examples: "Tech stocks rally", "Energy sector declines", "Banks face new regulations"

- "other": Non-market news or unclear scope

MACRO EVENT TYPE (only if scope="macro"):
- "trade_tariff": Trade wars, tariffs, export restrictions, trade sanctions
- "fed_policy": Federal Reserve decisions, rate changes, monetary policy
- "geopolitical": Wars, invasions, diplomatic crises, military conflicts
- "economic_data": Major economic data releases (CPI, jobs report, GDP) that move markets
- "financial_stress": Bank failures, defaults, credit crisis, liquidity concerns, bailouts
- "policy": Government shutdown, debt ceiling, fiscal policy, major legislation
- null: If scope is not "macro"

RULES:
- Assign 1-3 topics maximum per article
- Use exact topic names from list
- Prioritize specificity over generality
- Consider feedTopic and tickers as hints
- ALWAYS include "scope" field
- Include "macroEventType" only if scope="macro"
- Return valid JSON only, no explanations

EXAMPLES:

1. "Apple beats Q3 expectations with iPhone strength" (feedTopic: Technology, tickers: AAPL)
   → { "topics": ["Technology", "Earnings", "Markets"], "scope": "company", "macroEventType": null }

2. "Fed holds rates steady, surprising markets" (feedTopic: Economy)
   → { "topics": ["Fed Policy", "Economy", "Markets"], "scope": "macro", "macroEventType": "fed_policy" }

3. "China announces retaliatory shipping sanctions"
   → { "topics": ["Economy", "Politics"], "scope": "macro", "macroEventType": "trade_tariff" }

4. "Tesla recalls 2M vehicles over autopilot safety" (feedTopic: Technology, tickers: TSLA)
   → { "topics": ["Technology", "Business"], "scope": "company", "macroEventType": null }

5. "Semiconductor stocks slide on demand concerns"
   → { "topics": ["Technology", "Markets"], "scope": "sector", "macroEventType": null }

6. "CPI rises 3.5%, exceeding expectations"
   → { "topics": ["Economy", "Markets"], "scope": "macro", "macroEventType": "economic_data" }

7. "JPMorgan reports record trading revenue" (feedTopic: Business, tickers: JPM)
   → { "topics": ["Banking", "Earnings", "Markets"], "scope": "company", "macroEventType": null }

ARTICLES TO CLASSIFY:
${articlesJSON}

Return JSON in this exact format (use the exact article IDs from the input):
{
  "classifications": [
    {
      "id": "<use exact id from article>",
      "topics": ["Markets", "Technology"],
      "scope": "company",
      "macroEventType": null
    },
    {
      "id": "<use exact id from article>",
      "topics": ["Economy", "Fed Policy"],
      "scope": "macro",
      "macroEventType": "fed_policy"
    }
  ]
}

IMPORTANT:
- Use the EXACT id value from each article object in your response
- ALWAYS include "scope" field for every article
- Include "macroEventType" for every article (null if not macro)
- Valid scope values: "macro", "company", "sector", "other"
- Valid macroEventType values: "trade_tariff", "fed_policy", "geopolitical", "economic_data", "financial_stress", "policy", null`
}

/**
 * Article subset needed for classification
 */
interface ArticleForClassification {
  id: string
  headline: string
  description: string
  feedTopic?: string
  matchedTickers?: { symbol: string }[]
}

/**
 * Classification result from GPT
 */
interface ClassificationResult {
  id: string
  topics: string[]
  scope?: 'macro' | 'sector' | 'company' | 'other'
  macroEventType?: 'trade_tariff' | 'fed_policy' | 'geopolitical' | 'economic_data' | 'financial_stress' | 'policy' | null
}

/**
 * Response format from GPT
 */
interface GPTClassificationResponse {
  classifications: ClassificationResult[]
}

/**
 * Classification result with topics and macro attribution fields
 */
interface ClassificationResultData {
  topics: Topic[]
  scope?: 'macro' | 'sector' | 'company' | 'other'
  macroEventType?: 'trade_tariff' | 'fed_policy' | 'geopolitical' | 'economic_data' | 'financial_stress' | 'policy' | null
}

/**
 * Classify articles using OpenAI GPT-4o-mini
 * Returns topics and scope/macroEventType for each article or null on failure
 */
async function classifyWithGPT(
  articles: ArticleForClassification[]
): Promise<Map<string, ClassificationResultData> | null> {
  const client = getOpenAIClient()
  if (!client) return null

  try {
    const prompt = buildClassificationPrompt(articles)

    // Estimate tokens to avoid truncation
    const estimatedTokens = estimateTokens(prompt)
    if (estimatedTokens > 15000) {
      console.warn(`Prompt too large: ${estimatedTokens} tokens, may be truncated`)
    }

    console.log(`Classifying ${articles.length} articles with GPT-4o-mini`)

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are a financial news classifier. Return valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      console.error('No content in GPT response')
      return null
    }

    // Parse JSON response
    const parsed = JSON.parse(content) as GPTClassificationResponse

    if (!parsed.classifications || !Array.isArray(parsed.classifications)) {
      console.error('Invalid GPT response format:', parsed)
      return null
    }

    // Convert to Map with canonicalized topics and scope/macroEventType
    const results = new Map<string, ClassificationResultData>()
    for (const result of parsed.classifications) {
      const canonicalized = canonicalizeTopics(result.topics, 3)
      if (canonicalized.length > 0) {
        results.set(result.id, {
          topics: canonicalized,
          scope: result.scope,
          macroEventType: result.macroEventType
        })
      }
    }

    // Log metrics
    const usage = response.usage
    console.log(`GPT classification complete:`, {
      articles: articles.length,
      classified: results.size,
      tokens: usage?.total_tokens,
      cost: usage?.total_tokens
        ? ((usage.prompt_tokens * 0.15 + usage.completion_tokens * 0.60) / 1_000_000).toFixed(6)
        : 'unknown'
    })

    return results
  } catch (error: any) {
    console.error('GPT classification error:', error.message)
    return null
  }
}

/**
 * Classify articles with retry on parse failure
 */
async function classifyWithRetry(
  articles: ArticleForClassification[]
): Promise<Map<string, ClassificationResultData> | null> {
  let result = await classifyWithGPT(articles)

  // Single retry on failure
  if (result === null && articles.length > 0) {
    console.log('Retrying GPT classification...')
    result = await classifyWithGPT(articles)
  }

  return result
}

/**
 * Classify a batch of articles
 *
 * @param articles - Articles to classify
 * @param batchSize - Max articles per GPT call (default: 25)
 * @returns Articles with topics and classification metadata
 */
export async function classifyArticles(
  articles: NewsArticle[],
  batchSize: number = 25
): Promise<NewsArticle[]> {
  const results: NewsArticle[] = []

  // Process in batches
  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize)

    console.log(`Processing batch ${Math.floor(i / batchSize) + 1} (${batch.length} articles)`)

    // Try GPT classification
    const gptResults = await classifyWithRetry(batch)

    // Process each article in batch
    for (const article of batch) {
      const idempotencyKey = generateIdempotencyKey(article)

      // Get GPT classification result if available
      const gptResult = gptResults?.get(article.id)
      const gptTopics = gptResult?.topics || []
      const scope = gptResult?.scope
      const macroEventType = gptResult?.macroEventType

      // Get feed topic as fallback
      const feedTopic = article.feedTopic || 'Business'

      // Merge topics: GPT topics + feed topic, deduplicate
      const allTopics = [...gptTopics]
      if (!allTopics.includes(feedTopic as Topic)) {
        allTopics.push(feedTopic as Topic)
      }

      // Limit to 3 topics, prefer GPT topics first
      const finalTopics = allTopics.slice(0, 3)

      // Build metadata
      const metadata: TopicClassificationMetadata = {
        model: 'gpt-4o-mini',
        promptVersion: TOPIC_VERSION,
        classifiedAt: new Date(),
        idempotencyKey
      }

      results.push({
        ...article,
        topics: finalTopics,
        topicsClassified: gptResults !== null, // True if GPT succeeded
        classificationMetadata: metadata,
        scope: scope as any, // Store scope if available
        macroEventType: macroEventType as any // Store macroEventType if available
      })
    }
  }

  return results
}

/**
 * Get fallback topics for an article when classification fails
 * Uses hierarchy: feedTopic → RSS categories → 'Business'
 */
export function getFallbackTopics(article: NewsArticle): Topic[] {
  // Try feed topic first
  if (article.feedTopic) {
    return [article.feedTopic as Topic]
  }

  // Try RSS categories
  if (article.categories && article.categories.length > 0) {
    const canonicalized = canonicalizeTopics(article.categories, 1)
    if (canonicalized.length > 0) {
      return canonicalized
    }
  }

  // Default fallback
  return ['Business']
}

/**
 * Merge feed topic with GPT-classified topics
 * Ensures feed topic is included, GPT topics take priority
 */
export function mergeTopics(feedTopic: Topic, gptTopics: Topic[]): Topic[] {
  const merged = [...gptTopics]

  // Add feed topic if not already present
  if (!merged.includes(feedTopic)) {
    merged.push(feedTopic)
  }

  // Limit to 3 topics
  return merged.slice(0, 3)
}
