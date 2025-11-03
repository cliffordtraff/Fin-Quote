import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { createServerClient } from '@/lib/supabase/server'
import { getAaplFinancialsByMetric, FinancialMetric } from '@/app/actions/financials'
import { getAaplPrices, PriceRange } from '@/app/actions/prices'
import { getRecentFilings } from '@/app/actions/filings'
import { searchFilings } from '@/app/actions/search-filings'
import { buildToolSelectionPrompt, buildFinalAnswerPrompt } from '@/lib/tools'
import { generateFinancialChart, generatePriceChart } from '@/lib/chart-helpers'
import { validateAnswer } from '@/lib/validators'
import { shouldRegenerateAnswer, determineRegenerationAction, buildRegenerationPrompt } from '@/lib/regeneration'
import type { ConversationHistory } from '@/types/conversation'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder()

  try {
    const { question, conversationHistory = [], sessionId = '' } = await req.json()

    if (!question || question.trim().length === 0) {
      return new Response('Question cannot be empty', { status: 400 })
    }

    const stream = new ReadableStream({
      async start(controller) {
        // Helper to send JSON events
        const sendEvent = (event: string, data: any) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        }

        try {
          // Step 1: Tool selection (non-streaming)
          sendEvent('status', { step: 'selecting', message: 'Analyzing your question...' })

          const toolSelectionStart = Date.now()
          const selectionPrompt = buildToolSelectionPrompt(question)

          const selectionMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
            {
              role: 'system',
              content:
                'You are Fin Quote routing assistant. Your ONLY job is to pick exactly one tool and respond with valid JSON matching {"tool": string, "args": object}. Do not add explanations, comments, or Markdown.',
            },
            ...conversationHistory.slice(-10).map((msg: any) => ({
              role: msg.role as 'user' | 'assistant',
              content: msg.content,
            })),
            {
              role: 'user' as const,
              content: selectionPrompt,
            },
          ]

          const selectionResponse = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            messages: selectionMessages,
            ...(process.env.OPENAI_MODEL?.includes('gpt-5') ? {} : { temperature: 0 }),
            max_completion_tokens: process.env.OPENAI_MODEL?.includes('gpt-5') ? 20000 : 150,
            ...(process.env.OPENAI_MODEL?.includes('gpt-5') ? { reasoning_effort: 'minimal' } : {}),
            response_format: { type: 'json_object' },
          })

          const choiceMessage = selectionResponse.choices[0]?.message as any
          let selectionContent: string | undefined

          if (typeof choiceMessage?.content === 'string') {
            selectionContent = choiceMessage.content
          } else if (Array.isArray(choiceMessage?.content)) {
            selectionContent = choiceMessage.content
              .map((part: any) => {
                if (!part) return ''
                if (typeof part === 'string') return part
                if (typeof part.text === 'string') return part.text
                if (typeof part.content === 'string') return part.content
                return ''
              })
              .join('')
              .trim()
          }

          if (!selectionContent && choiceMessage?.parsed) {
            selectionContent = JSON.stringify(choiceMessage.parsed)
          }

          if (!selectionContent) {
            sendEvent('error', { message: 'Failed to select tool' })
            controller.close()
            return
          }

          let toolSelection: { tool: string; args: any }
          try {
            if (choiceMessage?.parsed) {
              toolSelection = choiceMessage.parsed
            } else {
              toolSelection = JSON.parse(selectionContent.trim())
            }
          } catch (parseError) {
            sendEvent('error', { message: 'Failed to parse tool selection' })
            controller.close()
            return
          }

          const toolSelectionLatencyMs = Date.now() - toolSelectionStart

          // Step 2: Tool execution
          sendEvent('status', { step: 'fetching', message: `Fetching data using ${toolSelection.tool}...` })

          const toolExecutionStart = Date.now()
          let factsJson: string
          let dataUsed: { type: 'financials' | 'prices' | 'filings' | 'passages'; data: any[] }
          let chartConfig: any = null

          // Execute the selected tool
          if (toolSelection.tool === 'getAaplFinancialsByMetric') {
            const metric = toolSelection.args.metric as FinancialMetric
            const validMetrics: FinancialMetric[] = [
              'revenue', 'gross_profit', 'net_income', 'operating_income',
              'total_assets', 'total_liabilities', 'shareholders_equity',
              'operating_cash_flow', 'eps',
            ]
            if (!validMetrics.includes(metric)) {
              sendEvent('error', { message: 'Invalid metric' })
              controller.close()
              return
            }

            const toolResult = await getAaplFinancialsByMetric({
              metric,
              limit: toolSelection.args.limit || 4,
            })

            if (toolResult.error || !toolResult.data) {
              sendEvent('error', { message: toolResult.error || 'Failed to fetch financial data' })
              controller.close()
              return
            }

            factsJson = JSON.stringify(toolResult.data, null, 2)
            dataUsed = { type: 'financials', data: toolResult.data }
            chartConfig = generateFinancialChart(toolResult.data, metric, question)
          } else if (toolSelection.tool === 'getPrices') {
            const range = toolSelection.args.range as PriceRange
            if (range !== '7d' && range !== '30d' && range !== '90d') {
              sendEvent('error', { message: 'Invalid range' })
              controller.close()
              return
            }

            const toolResult = await getAaplPrices({ range })

            if (toolResult.error || !toolResult.data) {
              sendEvent('error', { message: toolResult.error || 'Failed to fetch price data' })
              controller.close()
              return
            }

            factsJson = JSON.stringify(toolResult.data, null, 2)
            dataUsed = { type: 'prices', data: toolResult.data }
            chartConfig = generatePriceChart(toolResult.data, range)
          } else if (toolSelection.tool === 'getRecentFilings') {
            const limit = toolSelection.args.limit || 5
            if (limit < 1 || limit > 10) {
              sendEvent('error', { message: 'Invalid limit (must be 1-10)' })
              controller.close()
              return
            }

            const toolResult = await getRecentFilings({ limit })

            if (toolResult.error || !toolResult.data) {
              sendEvent('error', { message: toolResult.error || 'Failed to fetch filings data' })
              controller.close()
              return
            }

            factsJson = JSON.stringify(toolResult.data, null, 2)
            dataUsed = { type: 'filings', data: toolResult.data }
          } else if (toolSelection.tool === 'searchFilings') {
            const query = toolSelection.args.query || question
            if (!query || query.trim().length === 0) {
              sendEvent('error', { message: 'Search query cannot be empty' })
              controller.close()
              return
            }

            const limit = toolSelection.args.limit || 5
            if (limit < 1 || limit > 10) {
              sendEvent('error', { message: 'Invalid limit (must be 1-10)' })
              controller.close()
              return
            }

            const toolResult = await searchFilings({ query, limit })

            if (toolResult.error || !toolResult.data) {
              sendEvent('error', { message: toolResult.error || 'Failed to search filings' })
              controller.close()
              return
            }

            factsJson = JSON.stringify(toolResult.data, null, 2)
            dataUsed = { type: 'passages', data: toolResult.data }
          } else {
            sendEvent('error', { message: 'Unsupported tool selected' })
            controller.close()
            return
          }

          const toolExecutionLatencyMs = Date.now() - toolExecutionStart

          // Send data and chart to client
          sendEvent('data', { dataUsed, chartConfig })

          // Step 3: Stream answer generation
          sendEvent('status', { step: 'generating', message: 'Generating answer...' })

          const answerGenerationStart = Date.now()
          const answerPrompt = buildFinalAnswerPrompt(question, factsJson)

          const formattingInstructions = [
            'You are Fin Quote analyst assistant.',
            'Use only the provided facts; never guess or pull in outside data.',
            'Respond in plain text sentences with no Markdown, bullets, bold, italics, tables, or code blocks.',
            'If the answer covers more than four data points (years, filings, etc.), write at most two sentences: first sentence includes the earliest year/value, latest year/value, and any notable high or low; second sentence describes the overall trend and reminds the user to check the data table below for the full yearly breakdown.',
            'Keep answers concise and follow user instructions precisely.',
          ].join(' ')

          const historyLimit = process.env.OPENAI_MODEL?.includes('gpt-5') ? 4 : 10
          const recentHistory = conversationHistory.slice(-historyLimit)

          const answerMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
            { role: 'system', content: formattingInstructions },
            ...recentHistory.map((msg: any) => ({
              role: msg.role as 'user' | 'assistant',
              content: msg.content,
            })),
            {
              role: 'user' as const,
              content: answerPrompt,
            },
          ]

          const answerStream = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            messages: answerMessages,
            ...(process.env.OPENAI_MODEL?.includes('gpt-5') ? {} : { temperature: 0 }),
            max_completion_tokens: process.env.OPENAI_MODEL?.includes('gpt-5') ? 20000 : 500,
            ...(process.env.OPENAI_MODEL?.includes('gpt-5') ? { reasoning_effort: 'minimal' } : {}),
            stream: true,
          })

          // Stream the answer to client
          let fullAnswer = ''
          for await (const chunk of answerStream) {
            const content = chunk.choices[0]?.delta?.content || ''
            if (content) {
              fullAnswer += content
              sendEvent('answer', { content })
            }
          }

          const answerLatencyMs = Date.now() - answerGenerationStart

          // Step 4: Validate answer (server-side, after streaming)
          const supabase = createServerClient()

          const checkYearInDatabase = async (year: number): Promise<boolean> => {
            try {
              const { data, error } = await supabase
                .from('financials_std')
                .select('year')
                .eq('symbol', 'AAPL')
                .eq('year', year)
                .limit(1)

              if (error) return false
              return data && data.length > 0
            } catch {
              return false
            }
          }

          const validationResults = await validateAnswer(
            fullAnswer.trim(),
            dataUsed.data,
            checkYearInDatabase
          )

          // Send validation results
          sendEvent('validation', { results: validationResults })

          // Log query (optional - could be async)
          // You can implement logging here if needed

          // Send completion event
          sendEvent('complete', {
            answer: fullAnswer,
            latency: {
              toolSelection: toolSelectionLatencyMs,
              toolExecution: toolExecutionLatencyMs,
              answerGeneration: answerLatencyMs,
            }
          })

          controller.close()
        } catch (error) {
          console.error('Streaming error:', error)
          sendEvent('error', {
            message: error instanceof Error ? error.message : 'An unexpected error occurred'
          })
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Request error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'An unexpected error occurred' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
