'use server'

import OpenAI from 'openai'
import { getAaplFinancialsByMetric, FinancialMetric } from './financials'
import { getAaplPrices, PriceRange } from './prices'
import { getRecentFilings } from './filings'
import { searchFilings, FilingPassage } from './search-filings'
import { buildToolSelectionPrompt, buildFinalAnswerPrompt } from '@/lib/tools'
import { shouldGenerateChart, generateFinancialChart, generatePriceChart } from '@/lib/chart-helpers'
import type { ChartConfig } from '@/types/chart'
import type { ConversationHistory } from '@/types/conversation'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export type FinancialData = { year: number; value: number; metric: string }
export type PriceData = { date: string; close: number }
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
    type: 'financials' | 'prices' | 'filings' | 'passages'
    data: FinancialData[] | PriceData[] | FilingData[] | PassageData[]
  } | null
  chartConfig: ChartConfig | null
  error: string | null
}

/**
 * Main server action: orchestrate the two-step LLM flow
 * 1. Selection step: model picks a tool and args (with conversation history)
 * 2. Execution: run the tool
 * 3. Answer step: model generates final answer using facts (with conversation history)
 */
export async function askQuestion(
  userQuestion: string,
  conversationHistory: ConversationHistory = []
): Promise<AskQuestionResponse> {
  try {
    // Validate input
    if (!userQuestion || userQuestion.trim().length === 0) {
      return { answer: '', dataUsed: null, chartConfig: null, error: 'Question cannot be empty' }
    }

    // Step 1: Tool selection with conversation history
    const selectionPrompt = buildToolSelectionPrompt(userQuestion)

    // Build messages array with conversation history
    const selectionMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      // Include last 10 messages for context (limit to avoid token bloat)
      ...conversationHistory.slice(-10).map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      // Add current question with tool selection instructions
      {
        role: 'user' as const,
        content: selectionPrompt,
      },
    ]

    const selectionResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Fast and cheap for routing
      messages: selectionMessages,
      temperature: 0,
      max_tokens: 150,
    })

    const selectionContent = selectionResponse.choices[0]?.message?.content
    if (!selectionContent) {
      return { answer: '', dataUsed: null, chartConfig: null, error: 'Failed to select tool' }
    }

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
      }
    }

    // Step 2: Execute the tool based on selection
    let factsJson: string
    let dataUsed: { type: 'financials' | 'prices' | 'filings' | 'passages'; data: any[] }
    let chartConfig: ChartConfig | null = null

    if (toolSelection.tool === 'getAaplFinancialsByMetric') {
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
      ]
      if (!validMetrics.includes(metric)) {
        return { answer: '', dataUsed: null, chartConfig: null, error: 'Invalid metric' }
      }

      const toolResult = await getAaplFinancialsByMetric({
        metric,
        limit: toolSelection.args.limit || 4,
      })

      if (toolResult.error || !toolResult.data) {
        return {
          answer: '',
          dataUsed: null,
          chartConfig: null,
          error: toolResult.error || 'Failed to fetch financial data',
        }
      }

      factsJson = JSON.stringify(toolResult.data, null, 2)
      dataUsed = { type: 'financials', data: toolResult.data }

      // Generate chart for financial data
      chartConfig = generateFinancialChart(toolResult.data, metric)
    } else if (toolSelection.tool === 'getPrices') {
      // Validate range
      const range = toolSelection.args.range as PriceRange
      if (range !== '7d' && range !== '30d' && range !== '90d') {
        return { answer: '', dataUsed: null, chartConfig: null, error: 'Invalid range' }
      }

      const toolResult = await getAaplPrices({ range })

      if (toolResult.error || !toolResult.data) {
        return {
          answer: '',
          dataUsed: null,
          chartConfig: null,
          error: toolResult.error || 'Failed to fetch price data',
        }
      }

      factsJson = JSON.stringify(toolResult.data, null, 2)
      dataUsed = { type: 'prices', data: toolResult.data }

      // Generate chart for price data
      chartConfig = generatePriceChart(toolResult.data, range)
    } else if (toolSelection.tool === 'getRecentFilings') {
      // Validate limit
      const limit = toolSelection.args.limit || 5
      if (limit < 1 || limit > 10) {
        return { answer: '', dataUsed: null, chartConfig: null, error: 'Invalid limit (must be 1-10)' }
      }

      const toolResult = await getRecentFilings({ limit })

      if (toolResult.error || !toolResult.data) {
        return {
          answer: '',
          dataUsed: null,
          chartConfig: null,
          error: toolResult.error || 'Failed to fetch filings data',
        }
      }

      factsJson = JSON.stringify(toolResult.data, null, 2)
      dataUsed = { type: 'filings', data: toolResult.data }
    } else if (toolSelection.tool === 'searchFilings') {
      // Validate query
      const query = toolSelection.args.query || userQuestion
      if (!query || query.trim().length === 0) {
        return { answer: '', dataUsed: null, chartConfig: null, error: 'Search query cannot be empty' }
      }

      const limit = toolSelection.args.limit || 5
      if (limit < 1 || limit > 10) {
        return { answer: '', dataUsed: null, chartConfig: null, error: 'Invalid limit (must be 1-10)' }
      }

      const toolResult = await searchFilings({ query, limit })

      if (toolResult.error || !toolResult.data) {
        return {
          answer: '',
          dataUsed: null,
          chartConfig: null,
          error: toolResult.error || 'Failed to search filings',
        }
      }

      factsJson = JSON.stringify(toolResult.data, null, 2)
      dataUsed = { type: 'passages', data: toolResult.data }
    } else {
      return { answer: '', dataUsed: null, chartConfig: null, error: 'Unsupported tool selected' }
    }

    // Step 3: Generate final answer using the fetched facts and conversation history
    const answerPrompt = buildFinalAnswerPrompt(userQuestion, factsJson)

    // Build messages array with conversation history
    const answerMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      // Include last 10 messages for context
      ...conversationHistory.slice(-10).map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      // Add current question with facts
      {
        role: 'user' as const,
        content: answerPrompt,
      },
    ]

    const answerResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: answerMessages,
      temperature: 0,
      max_tokens: 500,
    })

    const answer = answerResponse.choices[0]?.message?.content
    if (!answer) {
      return { answer: '', dataUsed: null, chartConfig: null, error: 'Failed to generate answer' }
    }

    return {
      answer: answer.trim(),
      dataUsed,
      chartConfig,
      error: null,
    }
  } catch (err) {
    console.error('Error in askQuestion:', err)
    return {
      answer: '',
      dataUsed: null,
      chartConfig: null,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    }
  }
}
