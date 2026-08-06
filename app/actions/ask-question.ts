'use server'

import OpenAI from 'openai'
import { createServerClient } from '@/lib/supabase/server'
import { getFinancialsByMetric, getAaplFinancialsByMetric, FinancialMetric } from './financials'
import { getPrices, getAaplPrices, PriceRange, PriceParams } from './prices'
import { getRecentFilings } from './filings'
import { FilingPassage } from './search-filings'
import { buildToolSelectionPrompt, buildFinalAnswerPrompt } from '@/lib/tools'
import { shouldGenerateChart, generateFinancialChart, generatePriceChart } from '@/lib/chart-helpers'
import { validateAnswer } from '@/lib/validators'
import {
  shouldRegenerateAnswer,
  determineRegenerationAction,
  buildRegenerationPrompt,
  type RegenerationContext,
} from '@/lib/regeneration'
import type { ChartConfig } from '@/types/chart'
import type { ConversationHistory } from '@/types/conversation'
import { requireCurrentUser } from '@/lib/auth/current-user'
import {
  isChatbotEnabled,
  parseChatbotRequestPayload,
} from '@/lib/chatbot/request-policy'
import {
  CHAT_ANSWER_MAX_OUTPUT_TOKENS,
  CHAT_ROUTING_MAX_OUTPUT_TOKENS,
} from '@/lib/chatbot/constants'
import { logQuery } from '@/lib/query-logs'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

type SimpleMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const toResponseInputMessages = (messages: SimpleMessage[]) =>
  messages.map((msg, index) => ({
    id: `msg_${index}`,
    role: msg.role === 'assistant' ? 'assistant' : msg.role,
    content: [{ type: 'input_text', text: msg.content }],
    type: 'message',
  })) as any

const extractResponseText = (response: any): string | undefined => {
  if (response?.output_text) {
    return response.output_text
  }

  const messageOutput = (response?.output as any[])?.find(item => item.type === 'message')
  if (messageOutput?.content && Array.isArray(messageOutput.content)) {
    return messageOutput.content
      .map((part: any) => {
        if (part?.type === 'output_text' && typeof part?.text === 'string') return part.text
        if (typeof part?.text === 'string') return part.text
        if (typeof part === 'string') return part
        return ''
      })
      .join('')
      .trim()
  }

  return undefined
}

/**
 * Recursively round all numbers in an object/array to 2 decimal places
 * This prevents the LLM from seeing values like 1.5191298333175105
 */
function roundNumbersForLLM(data: any): any {
  if (data === null || data === undefined) return data

  if (typeof data === 'number') {
    // Round to 2 decimal places, but keep integers as integers
    if (Number.isInteger(data)) return data
    return Math.round(data * 100) / 100
  }

  if (Array.isArray(data)) {
    return data.map(item => roundNumbersForLLM(item))
  }

  if (typeof data === 'object') {
    const rounded: Record<string, any> = {}
    for (const key of Object.keys(data)) {
      rounded[key] = roundNumbersForLLM(data[key])
    }
    return rounded
  }

  return data
}

/**
 * Create facts JSON for LLM with rounded numbers
 */
function createFactsJson(data: any): string {
  return JSON.stringify(roundNumbersForLLM(data), null, 2)
}

export type FinancialData = { year: number; value: number; metric: string }
export type PriceData = { date: string; open: number; high: number; low: number; close: number; volume: number }
export type FilingData = {
  filing_type: string
  filing_date: string
  period_end_date: string
  fiscal_year: number
  fiscal_quarter: number | null
  document_url: string
}
export type PassageData = FilingPassage

export type AskQuestionResponse = {
  answer: string
  dataUsed: {
    type: 'financials' | 'prices' | 'filings' | 'passages' | 'financial_metrics' | 'metrics_catalog'
    data: any[]
  } | null
  chartConfig: ChartConfig | null
  error: string | null
  queryLogId: string | null
}

/**
 * Submit user feedback for a query
 */
export async function submitFeedback(params: {
  queryLogId: string
  feedback: 'thumbs_up' | 'thumbs_down'
  comment?: string
}): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createServerClient()

    // Type assertion needed because query_logs table not in generated types yet
    const { error } = await (supabase as any)
      .from('query_logs')
      .update({
        user_feedback: params.feedback,
        user_feedback_comment: params.comment || null,
      })
      .eq('id', params.queryLogId)

    if (error) {
      console.error('Failed to submit feedback:', error)
      return { success: false, error: error.message }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Failed to submit feedback (unexpected error):', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    }
  }
}

/**
 * Main server action: orchestrate the two-step LLM flow
 * 1. Selection step: model picks a tool and args (with conversation history)
 * 2. Execution: run the tool
 * 3. Answer step: model generates final answer using facts (with conversation history)
 */
export async function askQuestion(
  userQuestion: string,
  conversationHistory: ConversationHistory = [],
  sessionId: string = ''
): Promise<AskQuestionResponse> {
  // Track latencies for logging
  let toolSelectionLatencyMs: number | undefined
  let toolExecutionLatencyMs: number | undefined
  let answerLatencyMs: number | undefined
  let toolError: string | undefined

  // Track token usage for cost calculation
  let toolSelectionPromptTokens: number | undefined
  let toolSelectionCompletionTokens: number | undefined
  let toolSelectionTotalTokens: number | undefined
  let answerPromptTokens: number | undefined
  let answerCompletionTokens: number | undefined
  let answerTotalTokens: number | undefined
  let regenerationPromptTokens: number | undefined
  let regenerationCompletionTokens: number | undefined
  let regenerationTotalTokens: number | undefined
  let embeddingTokens: number | undefined

  try {
    if (!isChatbotEnabled()) {
      return {
        answer: '',
        dataUsed: null,
        chartConfig: null,
        error: 'Chatbot is not available.',
        queryLogId: null,
      }
    }

    const currentUser = await requireCurrentUser()
    const requestPayload = parseChatbotRequestPayload({
      question: userQuestion,
      conversationHistory,
      sessionId,
    })

    // Use only the validated, size-bounded message fields in prompts. Rich UI
    // fields such as chart configs and data tables are deliberately discarded.
    userQuestion = requestPayload.question
    conversationHistory = requestPayload.conversationHistory.map((message) => ({
      ...message,
      timestamp: message.timestamp || '',
    }))
    sessionId = requestPayload.sessionId

    // Extract previous tool results (last 2 assistant messages with data)
    const previousToolResults = conversationHistory
      .filter(msg => msg.role === 'assistant' && msg.dataUsed && msg.dataUsed.data && msg.dataUsed.data.length > 0)
      .slice(-2) // Get last 2
      .map(msg => ({
        question: conversationHistory[conversationHistory.indexOf(msg) - 1]?.content || 'Unknown question',
        answer: msg.content,
        toolData: msg.dataUsed
      }))

    // Step 1: Tool selection with conversation history
    const toolSelectionStart = Date.now()
    const selectionPrompt = buildToolSelectionPrompt(userQuestion, previousToolResults)

    // Build messages array with conversation history
    const selectionMessages: SimpleMessage[] = [
      {
        role: 'system',
        content:
          'You are Fin Quote routing assistant. Your ONLY job is to pick exactly one tool and respond with valid JSON matching {"tool": string, "args": object}. Do not add explanations, comments, or Markdown.',
      },
      // Include last 10 messages for context (limit to avoid token bloat)
      ...conversationHistory.slice(-10).map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      // Add current question with tool selection instructions
      {
        role: 'user',
        content: selectionPrompt,
      },
    ]

    const selectionInput = toResponseInputMessages(selectionMessages)

    const selectionResponse = await openai.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini', // Fast and cheap for routing
      input: selectionInput,
      ...(process.env.OPENAI_MODEL?.includes('gpt-5') ? {} : { temperature: 0 }),
      // GPT-5 reasoning tokens count against this bounded routing allowance.
      max_output_tokens: process.env.OPENAI_MODEL?.includes('gpt-5')
        ? CHAT_ROUTING_MAX_OUTPUT_TOKENS
        : 150,
      ...(process.env.OPENAI_MODEL?.includes('gpt-5') ? { reasoning: { effort: 'minimal' } } : {}),
      text: { format: { type: 'json_object' } },
    })

    // Capture token usage
    toolSelectionPromptTokens = selectionResponse.usage?.input_tokens
    toolSelectionCompletionTokens = selectionResponse.usage?.output_tokens
    toolSelectionTotalTokens = selectionResponse.usage?.total_tokens

    console.log('🎯 TOOL SELECTION TOKENS:', {
      input: toolSelectionPromptTokens,
      output: toolSelectionCompletionTokens,
      total: toolSelectionTotalTokens
    })

    // Extract content from Responses API output
    let selectionContent: string | undefined = extractResponseText(selectionResponse as any)

    if (!selectionContent) {
      console.error('Tool selection returned empty response:', selectionResponse)
      return { answer: '', dataUsed: null, chartConfig: null, error: 'Failed to select tool', queryLogId: null }
    }

    console.log('🔍 DEBUG - Tool selection content:', selectionContent)

    // Parse the JSON response
    let toolSelection: { tool: string; args: any }
    try {
      toolSelection = JSON.parse(selectionContent.trim())
    } catch (parseError) {
      console.error('Failed to parse tool selection:', selectionContent)
      return {
        answer: '',
        dataUsed: null,
        chartConfig: null,
        error: 'Failed to parse tool selection',
        queryLogId: null,
      }
    }

    toolSelectionLatencyMs = Date.now() - toolSelectionStart

    // DEBUG: Log tool selection
    console.log('🔍 Tool Selection:', JSON.stringify(toolSelection, null, 2))

    // Step 2: Execute the tool based on selection
    const toolExecutionStart = Date.now()
    let factsJson: string
    let dataUsed: { type: 'financials' | 'prices' | 'filings' | 'passages' | 'metrics_catalog' | 'financial_metrics'; data: any[] }
    let chartConfig: ChartConfig | null = null

    if (toolSelection.tool === 'getFinancialsByMetric' || toolSelection.tool === 'getAaplFinancialsByMetric') {
      // Validate metric
      const metric = toolSelection.args.metric as FinancialMetric
      const validMetrics: FinancialMetric[] = [
        'revenue',
        'gross_profit',
        'net_income',
        'operating_income',
        'total_assets',
        'total_liabilities',
        'shareholders_equity',
        'operating_cash_flow',
        'eps',
        'debt_to_equity_ratio',
        'gross_margin',
        'roe',
      ]
      if (!validMetrics.includes(metric)) {
        return { answer: '', dataUsed: null, chartConfig: null, error: 'Invalid metric', queryLogId: null }
      }

      // Extract symbol, period and quarters from args
      const symbol = toolSelection.args.symbol as string || 'AAPL'
      const period = (toolSelection.args.period as 'annual' | 'quarterly') || 'annual'
      const quarters = toolSelection.args.quarters as number[] | undefined

      console.log('📊 Calling getFinancialsByMetric with:', {
        symbol,
        metric,
        limit: toolSelection.args.limit || (period === 'quarterly' ? 12 : 4),
        period,
        quarters,
      })

      const toolResult = await getFinancialsByMetric({
        symbol,
        metric,
        limit: toolSelection.args.limit || (period === 'quarterly' ? 12 : 4),
        period,
        quarters,
      })

      console.log('📊 Data returned:', toolResult.data?.length, 'rows, sample:', toolResult.data?.[0])

      if (toolResult.error || !toolResult.data) {
        toolError = toolResult.error || 'Failed to fetch financial data'
        return {
          answer: '',
          dataUsed: null,
          chartConfig: null,
          error: toolError,
          queryLogId: null,
        }
      }

      factsJson = createFactsJson(toolResult.data)
      dataUsed = { type: 'financials', data: toolResult.data }

      // Generate chart for financial data (pass user question to detect margin vs raw value requests)
      chartConfig = generateFinancialChart(toolResult.data, metric, userQuestion)
    } else if (toolSelection.tool === 'getPrices') {
      // Support both preset ranges and custom dates
      const symbol = toolSelection.args.symbol as string || 'AAPL'
      let priceParams: PriceParams = { symbol }

      if ('range' in toolSelection.args) {
        // Preset range mode
        const range = toolSelection.args.range as PriceRange
        const allowedRanges: PriceRange[] = ['7d', '30d', '90d', '365d', 'ytd', '3y', '5y', '10y', '20y', 'max']
        if (!allowedRanges.includes(range)) {
          return { answer: '', dataUsed: null, chartConfig: null, error: 'Invalid range', queryLogId: null }
        }
        priceParams = { symbol, range }
      } else if ('from' in toolSelection.args) {
        // Custom date range mode
        const from = toolSelection.args.from as string
        const to = toolSelection.args.to as string | undefined

        // Basic date format validation
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/
        if (!dateRegex.test(from)) {
          return { answer: '', dataUsed: null, chartConfig: null, error: 'Invalid from date format', queryLogId: null }
        }
        if (to && !dateRegex.test(to)) {
          return { answer: '', dataUsed: null, chartConfig: null, error: 'Invalid to date format', queryLogId: null }
        }

        priceParams = to ? { symbol, from, to } : { symbol, from }
      } else {
        return { answer: '', dataUsed: null, chartConfig: null, error: 'Invalid getPrices args: must have range or from', queryLogId: null }
      }

      console.log('📈 Calling getPrices with:', priceParams)
      const toolResult = await getPrices(priceParams)

      if (toolResult.error || !toolResult.data) {
        toolError = toolResult.error || 'Failed to fetch price data'
        return {
          answer: '',
          dataUsed: null,
          chartConfig: null,
          error: toolError,
          queryLogId: null,
        }
      }

      // Limit data sent to LLM to prevent JSON serialization errors
      // For large datasets, provide summary statistics instead of all data points
      const MAX_PRICE_POINTS_FOR_LLM = 50
      let dataForLLM: any

      if (toolResult.data.length > MAX_PRICE_POINTS_FOR_LLM) {
        // Provide summary data instead of all points
        const first = toolResult.data[0]
        const last = toolResult.data[toolResult.data.length - 1]
        const prices = toolResult.data.map(d => d.close)
        const high = Math.max(...prices)
        const low = Math.min(...prices)

        dataForLLM = {
          summary: `${toolResult.data.length} daily price records`,
          dateRange: { from: first.date, to: last.date },
          priceRange: { high, low, start: first.close, end: last.close },
          note: "Full price data available in chart"
        }
        console.log('📊 Using SUMMARY for LLM:', toolResult.data.length, 'records →', JSON.stringify(dataForLLM).length, 'chars')
      } else {
        dataForLLM = toolResult.data
        console.log('📊 Using FULL data for LLM:', toolResult.data.length, 'records')
      }

      factsJson = createFactsJson(dataForLLM)
      dataUsed = { type: 'prices', data: dataForLLM }

      // Generate chart for price data (use range if available, otherwise use from-to)
      const chartLabel = priceParams.range || (priceParams.from ? `${priceParams.from} to ${priceParams.to || 'today'}` : 'Price History')
      chartConfig = generatePriceChart(toolResult.data, chartLabel)
    } else if (toolSelection.tool === 'getRecentFilings') {
      // Validate limit
      const limit = toolSelection.args.limit || 5
      if (limit < 1 || limit > 10) {
        return { answer: '', dataUsed: null, chartConfig: null, error: 'Invalid limit (must be 1-10)', queryLogId: null }
      }

      // Note: Chatbot is AAPL-only for MVP
      const toolResult = await getRecentFilings({ ticker: 'AAPL', limit })

      if (toolResult.error || !toolResult.data) {
        toolError = toolResult.error || 'Failed to fetch filings data'
        return {
          answer: '',
          dataUsed: null,
          chartConfig: null,
          error: toolError,
          queryLogId: null,
        }
      }

      factsJson = createFactsJson(toolResult.data)
      dataUsed = { type: 'filings', data: toolResult.data }
    } else if (toolSelection.tool === 'searchFilings') {
      // Filing content search is disabled; respond gracefully
      const message =
        'Filing content search is temporarily unavailable. I can share filing dates/types or financial metrics instead.'
      return { answer: message, dataUsed: null, chartConfig: null, error: null, queryLogId: null }
    } else if (toolSelection.tool === 'listMetrics') {
      // Import at the top if not already imported
      const { listMetrics } = await import('./list-metrics')

      // Optional category filter
      const category = toolSelection.args.category as string | undefined

      const toolResult = await listMetrics(category ? { category } : undefined)

      if (toolResult.error || !toolResult.data) {
        toolError = toolResult.error || 'Failed to list metrics'
        return {
          answer: '',
          dataUsed: null,
          chartConfig: null,
          error: toolError,
          queryLogId: null,
        }
      }

      factsJson = createFactsJson(toolResult.data)
      dataUsed = { type: 'metrics_catalog', data: toolResult.data }
    } else if (toolSelection.tool === 'getFinancialMetric') {
      // Import at the top if not already imported
      const { getFinancialMetrics } = await import('./get-financial-metric')

      // Extract symbol and metric names (can be array or single string)
      const symbol = toolSelection.args.symbol as string || 'AAPL'
      const metricNames = toolSelection.args.metricNames as string[]
      const period = (toolSelection.args.period as 'annual' | 'quarterly' | 'ttm') || 'annual'
      const quarters = toolSelection.args.quarters as number[] | undefined

      // TTM doesn't use limit (returns single value per metric)
      const defaultLimit = period === 'ttm' ? 1 : period === 'quarterly' ? 12 : 5
      const maxLimit = period === 'ttm' ? 1 : period === 'quarterly' ? 40 : 20
      const limit = period === 'ttm' ? 1 : (toolSelection.args.limit || defaultLimit)

      if (!metricNames || metricNames.length === 0) {
        return {
          answer: '',
          dataUsed: null,
          chartConfig: null,
          error: 'No metrics specified',
          queryLogId: null,
        }
      }

      // Skip limit validation for TTM since it returns just one value
      if (period !== 'ttm' && (limit < 1 || limit > maxLimit)) {
        return {
          answer: '',
          dataUsed: null,
          chartConfig: null,
          error: `Invalid limit (must be 1-${maxLimit})`,
          queryLogId: null,
        }
      }

      console.log('📊 Calling getFinancialMetrics with:', { symbol, metricNames, limit, period, quarters })
      const toolResult = await getFinancialMetrics({
        symbol,
        metricNames,
        limit,
        period,
        quarters,
      })

      if (toolResult.error || !toolResult.data) {
        toolError = toolResult.error || 'Failed to fetch financial metrics'
        return {
          answer: '',
          dataUsed: null,
          chartConfig: null,
          error: toolError,
          queryLogId: null,
        }
      }

      factsJson = createFactsJson(toolResult.data)
      dataUsed = { type: 'financial_metrics', data: toolResult.data }

      // Generate chart for extended metrics (single metric queries only)
      if (toolResult.data && toolResult.data.length >= 2 && metricNames.length === 1) {
        const { generateExtendedMetricChart } = await import('@/lib/chart-helpers')
        // Use the resolved canonical metric name from the data
        const canonicalMetricName = toolResult.data[0].metric_name
        chartConfig = generateExtendedMetricChart(toolResult.data, canonicalMetricName, userQuestion)
      }
    } else {
      return { answer: '', dataUsed: null, chartConfig: null, error: 'Unsupported tool selected', queryLogId: null }
    }

    toolExecutionLatencyMs = Date.now() - toolExecutionStart

    // Step 3: Generate final answer using the fetched facts and conversation history
    const answerGenerationStart = Date.now()
    const answerPrompt = buildFinalAnswerPrompt(userQuestion, factsJson, previousToolResults)

    // Debug logging
    console.log('🔍 DEBUG - Question:', userQuestion)
    console.log('🔍 DEBUG - Facts JSON LENGTH:', factsJson.length, 'characters')
    console.log('🔍 DEBUG - Facts JSON PREVIEW:', factsJson.substring(0, 500))
    console.log('🔍 DEBUG - Facts JSON FULL:', factsJson)
    console.log('🔍 DEBUG - Prompt (first 800 chars):', answerPrompt.substring(0, 800))

    // Build messages array with conversation history
    const formattingInstructions = [
      'You are Fin Quote analyst assistant.',
      'Use only the provided facts; never guess or pull in outside data.',
      'Respond in plain text sentences with no Markdown, bullets, bold, italics, tables, or code blocks.',
      'If the answer covers more than four data points (years, filings, etc.), write at most two sentences: first sentence includes the earliest year/value, latest year/value, and any notable high or low; second sentence describes the overall trend and reminds the user to check the data table below for the full yearly breakdown.',
      'Keep answers concise and follow user instructions precisely.',
    ].join(' ')

    const historyLimit = process.env.OPENAI_MODEL?.includes('gpt-5') ? 4 : 10
    const recentHistory = conversationHistory.slice(-historyLimit)

    const answerMessages: SimpleMessage[] = [
      { role: 'system', content: formattingInstructions },
      // Include a limited slice of prior conversation to reduce prompt size
      ...recentHistory.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      // Add current question with facts
      {
        role: 'user',
        content: answerPrompt,
      },
    ]

    const answerInput = toResponseInputMessages(answerMessages)

    const answerResponse = await openai.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      input: answerInput,
      ...(process.env.OPENAI_MODEL?.includes('gpt-5') ? {} : { temperature: 0 }),
      // Keep the concise answer flow inside the shared per-request spend cap.
      max_output_tokens: process.env.OPENAI_MODEL?.includes('gpt-5')
        ? CHAT_ANSWER_MAX_OUTPUT_TOKENS
        : 500,
      ...(process.env.OPENAI_MODEL?.includes('gpt-5') ? { reasoning: { effort: 'minimal' } } : {}),
    })

    // Capture token usage
    answerPromptTokens = answerResponse.usage?.input_tokens
    answerCompletionTokens = answerResponse.usage?.output_tokens
    answerTotalTokens = answerResponse.usage?.total_tokens

    console.log('💬 ANSWER GENERATION TOKENS:', {
      input: answerPromptTokens,
      output: answerCompletionTokens,
      total: answerTotalTokens
    })
    console.log('🔍 DEBUG - Answer response:', JSON.stringify(answerResponse, null, 2))

    // Extract answer from Responses API output
    // Use output_text convenience field if available, otherwise extract from message output
    let answer: string | undefined = extractResponseText(answerResponse as any)

    if (!answer) {
      console.error('❌ Answer generation returned empty content. Full response:', answerResponse)
      return { answer: '', dataUsed: null, chartConfig: null, error: 'Failed to generate answer', queryLogId: null }
    }

    console.log('🔍 DEBUG - LLM Answer:', answer)

    answerLatencyMs = Date.now() - answerGenerationStart

    // Step 4: Validate the answer (Phase 1)
    const supabase = await createServerClient()

    // Helper function to check if a year exists in the database
    const checkYearInDatabase = async (year: number): Promise<boolean> => {
      try {
        const { data, error } = await supabase
          .from('financials_std' as any)
          .select('year')
          .eq('symbol', 'AAPL' as any)
          .eq('year', year as any)
          .limit(1)

        if (error) {
          console.error('Error checking year in database:', error)
          return false
        }

        return data && data.length > 0
      } catch (err) {
        console.error('Error in checkYearInDatabase:', err)
        return false
      }
    }

    // Run validation (pass userQuestion for period type validation)
    let validationResults = await validateAnswer(
      answer.trim(),
      dataUsed.data,
      checkYearInDatabase,
      userQuestion
    )

    // Phase 3: Auto-Correction with Regeneration
    let finalAnswer = answer.trim()
    let regenerationAttempted = false
    let regenerationSucceeded = false
    let firstAttemptAnswer = answer.trim()
    let firstAttemptValidation = validationResults

    // Check if we should regenerate
    const regenerationDecision = shouldRegenerateAnswer(validationResults)

    if (regenerationDecision.shouldRegenerate) {
      regenerationAttempted = true
      console.log('🔄 Regeneration triggered:', {
        reason: regenerationDecision.reason,
        severity: regenerationDecision.severity,
      })

      try {
        // Determine regeneration action (refetch data if needed)
        const context: RegenerationContext = {
          originalQuestion: userQuestion,
          originalAnswer: answer.trim(),
          validationResults,
          data: dataUsed.data,
          toolName: toolSelection.tool,
          toolArgs: toolSelection.args,
        }

        const action = determineRegenerationAction(context, regenerationDecision)

        // Refetch data if needed (e.g., year exists in DB but wasn't fetched)
        let regenerationData = dataUsed.data

        if (action.refetchData && action.refetchArgs) {
          console.log('🔄 Refetching data with corrected args:', action.refetchArgs)

          if (toolSelection.tool === 'getFinancialsByMetric' || toolSelection.tool === 'getAaplFinancialsByMetric') {
            // Ensure symbol is passed in refetch args
            const refetchArgs = {
              ...action.refetchArgs,
              symbol: action.refetchArgs.symbol || toolSelection.args.symbol || 'AAPL',
            }
            const refetchResult = await getFinancialsByMetric(refetchArgs)
            if (refetchResult.data) {
              regenerationData = refetchResult.data
              dataUsed.data = refetchResult.data // Update dataUsed for final response
            }
          }
        }

        // Build regeneration prompt
        const regenerationPrompt = buildRegenerationPrompt(
          {
            ...context,
            data: regenerationData,
          },
          buildFinalAnswerPrompt
        )

        // Regenerate answer
        const regenerationStart = Date.now()
        const regenerationMessages: SimpleMessage[] = [
          {
            role: 'user',
            content: regenerationPrompt,
          },
        ]

        const regenerationResponse = await openai.responses.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          input: toResponseInputMessages(regenerationMessages),
          ...(process.env.OPENAI_MODEL?.includes('gpt-5') ? {} : { temperature: 0 }),
          // Regeneration uses the same bounded allowance as the first answer.
          max_output_tokens: process.env.OPENAI_MODEL?.includes('gpt-5')
            ? CHAT_ANSWER_MAX_OUTPUT_TOKENS
            : 500,
          ...(process.env.OPENAI_MODEL?.includes('gpt-5') ? { reasoning: { effort: 'minimal' } } : {}),
        })

        // Capture regeneration token usage
        regenerationPromptTokens = regenerationResponse.usage?.input_tokens
        regenerationCompletionTokens = regenerationResponse.usage?.output_tokens
        regenerationTotalTokens = regenerationResponse.usage?.total_tokens

        // Extract regenerated answer from Responses API output
        const regeneratedAnswer: string | undefined = extractResponseText(regenerationResponse as any)

        if (regeneratedAnswer) {
          const regenerationLatency = Date.now() - regenerationStart

          // Validate the regenerated answer
          const regeneratedValidation = await validateAnswer(
            regeneratedAnswer.trim(),
            regenerationData,
            checkYearInDatabase,
            userQuestion
          )

          console.log('🔄 Regeneration validation:', {
            passed: regeneratedValidation.overall_passed,
            severity: regeneratedValidation.overall_severity,
            latency: regenerationLatency,
          })

          // If regeneration passed, use it!
          if (regeneratedValidation.overall_passed) {
            finalAnswer = regeneratedAnswer.trim()
            validationResults = regeneratedValidation
            regenerationSucceeded = true
            console.log('✅ Regeneration succeeded - using new answer')
          } else {
            // Regeneration still failed, use original
            console.warn('⚠️ Regeneration failed validation - using original answer')
          }
        }
      } catch (regenerationError) {
        console.error('❌ Regeneration error:', regenerationError)
        // Fall back to original answer on error
      }
    }

    // Log validation results
    if (!validationResults.overall_passed) {
      console.warn('Validation failed:', {
        question: userQuestion,
        tool: toolSelection.tool,
        severity: validationResults.overall_severity,
        number_status: validationResults.number_validation.status,
        year_status: validationResults.year_validation.status,
        filing_status: validationResults.filing_validation.status,
        regeneration_attempted: regenerationAttempted,
        regeneration_succeeded: regenerationSucceeded,
      })
    }

    // Log the query and get the log ID for feedback
    let queryLogId: string | null = null
    if (sessionId) {
      // Add regeneration metadata to validation results
      const validationResultsWithRegen = {
        ...validationResults,
        regeneration: regenerationAttempted ? {
          triggered: true,
          first_attempt_answer: firstAttemptAnswer,
          first_attempt_validation: {
            passed: firstAttemptValidation.overall_passed,
            severity: firstAttemptValidation.overall_severity,
          },
          second_attempt_passed: regenerationSucceeded,
          reason: regenerationDecision.reason,
        } : {
          triggered: false,
        },
      }

      queryLogId = await logQuery({
        sessionId,
        userId: currentUser.id,
        userQuestion,
        toolSelected: toolSelection.tool,
        toolArgs: toolSelection.args,
        toolSelectionLatencyMs,
        dataReturned: null, // For Phase 1, store null to save space; can enable in Phase 2
        dataRowCount: dataUsed.data.length,
        toolExecutionLatencyMs,
        toolError,
        answerGenerated: finalAnswer, // Use final answer (potentially regenerated)
        answerLatencyMs,
        validationResults: validationResultsWithRegen,
        // Token usage for cost tracking
        toolSelectionPromptTokens,
        toolSelectionCompletionTokens,
        toolSelectionTotalTokens,
        answerPromptTokens,
        answerCompletionTokens,
        answerTotalTokens,
        regenerationPromptTokens,
        regenerationCompletionTokens,
        regenerationTotalTokens,
        embeddingTokens,
      })
    }

    return {
      answer: finalAnswer, // Return the final answer (original or regenerated)
      dataUsed,
      chartConfig,
      error: null,
      queryLogId,
    }
  } catch (err) {
    console.error('Error in askQuestion:', err)
    return {
      answer: '',
      dataUsed: null,
      chartConfig: null,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
      queryLogId: null,
    }
  }
}
