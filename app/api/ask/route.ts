import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { createServerClient } from '@/lib/supabase/server'
import { getAaplFinancialsByMetric, FinancialMetric } from '@/app/actions/financials'
import { getAaplPrices, PriceRange } from '@/app/actions/prices'
import { getRecentFilings } from '@/app/actions/filings'
import { searchFilings } from '@/app/actions/search-filings'
import { buildToolSelectionPrompt, buildFinalAnswerPrompt, buildFollowUpQuestionsPrompt } from '@/lib/tools'
import { generateFinancialChart, generatePriceChart } from '@/lib/chart-helpers'
import { validateAnswer } from '@/lib/validators'
import { shouldRegenerateAnswer, determineRegenerationAction, buildRegenerationPrompt } from '@/lib/regeneration'
import { logQuery } from '@/app/actions/ask-question'
import { createFlowEmitter } from '@/lib/flow/events'
import type { ConversationHistory } from '@/types/conversation'

type SimpleMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const toResponseInputMessages = (messages: SimpleMessage[]) =>
  messages.map((msg, index) => ({
    id: `msg_${index}`,
    role: msg.role === 'assistant' ? 'assistant' : msg.role,
    content: msg.role === 'assistant'
      ? [{ type: 'output_text', text: msg.content }]
      : [{ type: 'input_text', text: msg.content }],
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

        const flow = createFlowEmitter(flowEvent => {
          sendEvent('flow', flowEvent)
        })

        let answerGenerationStarted = false
        let validationInProgress = false
        let followUpInProgress = false

        try {
          flow.startStep({
            step: 'tool_selection',
            group: 'planning',
            summary: 'Selecting best tool',
            why: 'Analyzing question and recent history',
            details: { question },
          })

          // Step 1: Tool selection (non-streaming)
          sendEvent('status', { step: 'selecting', message: 'Analyzing your question...' })

          const toolSelectionStart = Date.now()
          const selectionPrompt = buildToolSelectionPrompt(question)

          const selectionMessages: SimpleMessage[] = [
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
              role: 'user',
              content: selectionPrompt,
            },
          ]

          const selectionResponse = await openai.responses.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            input: toResponseInputMessages(selectionMessages),
            ...(process.env.OPENAI_MODEL?.includes('gpt-5') ? {} : { temperature: 0 }),
            max_output_tokens: process.env.OPENAI_MODEL?.includes('gpt-5') ? 20000 : 150,
            ...(process.env.OPENAI_MODEL?.includes('gpt-5') ? { reasoning: { effort: 'minimal' } } : {}),
            text: { format: { type: 'json_object' } },
          })

          const selectionContent = extractResponseText(selectionResponse)


          if (!selectionContent) {
            flow.failStep('tool_selection', {
              summary: 'Tool selection failed',
              why: 'No content returned from model',
            })
            sendEvent('error', { message: 'Failed to select tool' })
            controller.close()
            return
          }

          let toolSelection: { tool: string; args: any }
          try {
            toolSelection = JSON.parse(selectionContent.trim())
            console.log('🔧 Tool selection:', JSON.stringify(toolSelection, null, 2))
          } catch (parseError) {
            flow.failStep('tool_selection', {
              summary: 'Tool selection failed',
              why: 'Unable to parse tool selection response',
              details: { raw: selectionContent },
            })
            sendEvent('error', { message: 'Failed to parse tool selection' })
            controller.close()
            return
          }

          const selectionReason =
            toolSelection && typeof (toolSelection as any).reasoning === 'string'
              ? (toolSelection as any).reasoning
              : undefined

          const toolSelectionLatencyMs = Date.now() - toolSelectionStart

          flow.completeStep({
            step: 'tool_selection',
            status: 'success',
            summary: `Selected ${toolSelection.tool}`,
            why: selectionReason ?? 'Selected tool based on question analysis',
            details: {
              args: toolSelection.args,
              latencyMs: toolSelectionLatencyMs,
            },
          })

          flow.startStep({
            step: 'tool_execution',
            group: 'data',
            summary: `Executing ${toolSelection.tool}`,
            why: 'Fetching required data for answer',
            details: { args: toolSelection.args },
          })

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
              // Raw metrics
              'revenue', 'gross_profit', 'net_income', 'operating_income',
              'total_assets', 'total_liabilities', 'shareholders_equity',
              'operating_cash_flow', 'eps',
              // Calculated metrics
              'debt_to_equity_ratio', 'gross_margin', 'roe',
            ]
            if (!validMetrics.includes(metric)) {
              console.error('❌ Invalid metric received:', metric, 'Valid metrics:', validMetrics)
              flow.failStep('tool_execution', {
                summary: 'Failed to execute tool',
                why: `Invalid metric "${metric}"`,
                details: { metric },
              })
              sendEvent('error', { message: `Invalid metric: ${metric}` })
              controller.close()
              return
            }

            const toolResult = await getAaplFinancialsByMetric({
              metric,
              limit: toolSelection.args.limit || 4,
            })

            if (toolResult.error || !toolResult.data) {
              flow.failStep('tool_execution', {
                summary: 'Financial data fetch failed',
                why: toolResult.error || 'No data returned',
                details: { metric },
              })
              sendEvent('error', { message: toolResult.error || 'Failed to fetch financial data' })
              controller.close()
              return
            }

            factsJson = JSON.stringify(toolResult.data, null, 2)
            dataUsed = { type: 'financials', data: toolResult.data }

            flow.startStep({
              step: 'chart_generation',
              group: 'answering',
              summary: `Preparing ${metric} chart`,
              why: 'Visualizing financial trend for user',
              details: { metric, source: 'financials' },
            })
            chartConfig = generateFinancialChart(toolResult.data, metric, question)
            if (chartConfig) {
              const pointCount =
                Array.isArray((chartConfig as any)?.data) && (chartConfig as any).data.length
                  ? (chartConfig as any).data.length
                  : Array.isArray((chartConfig as any)?.series) && (chartConfig as any).series.length > 0
                    ? ((chartConfig as any).series[0]?.data?.length ?? 0)
                    : 0

              flow.completeStep({
                step: 'chart_generation',
                summary: `Prepared ${chartConfig.type ?? 'line'} chart`,
                why: 'Chart ready for display alongside answer',
                details: { metric, pointCount },
              })
            } else {
              flow.warnStep('chart_generation', {
                summary: 'Chart not generated',
                why: 'Insufficient data to build chart',
                details: { metric },
              })
            }
          } else if (toolSelection.tool === 'getPrices') {
            const range = toolSelection.args.range as PriceRange
            if (range !== '7d' && range !== '30d' && range !== '90d') {
              flow.failStep('tool_execution', {
                summary: 'Failed to execute tool',
                why: `Invalid price range "${range}"`,
                details: { range },
              })
              sendEvent('error', { message: 'Invalid range' })
              controller.close()
              return
            }

            const toolResult = await getAaplPrices({ range })

            if (toolResult.error || !toolResult.data) {
              flow.failStep('tool_execution', {
                summary: 'Price data fetch failed',
                why: toolResult.error || 'No data returned',
                details: { range },
              })
              sendEvent('error', { message: toolResult.error || 'Failed to fetch price data' })
              controller.close()
              return
            }

            factsJson = JSON.stringify(toolResult.data, null, 2)
            dataUsed = { type: 'prices', data: toolResult.data }
            flow.startStep({
              step: 'chart_generation',
              group: 'answering',
              summary: `Preparing ${range} price chart`,
              why: 'Visualizing recent price movement',
              details: { range, source: 'prices' },
            })
            chartConfig = generatePriceChart(toolResult.data, range)
            if (chartConfig) {
              const pointCount =
                Array.isArray((chartConfig as any)?.data) && (chartConfig as any).data.length
                  ? (chartConfig as any).data.length
                  : Array.isArray((chartConfig as any)?.series) && (chartConfig as any).series.length > 0
                    ? ((chartConfig as any).series[0]?.data?.length ?? 0)
                    : 0
              flow.completeStep({
                step: 'chart_generation',
                summary: `Prepared ${chartConfig.type ?? 'line'} chart`,
                why: 'Chart ready for display alongside answer',
                details: { range, pointCount },
              })
            } else {
              flow.warnStep('chart_generation', {
                summary: 'Chart not generated',
                why: 'Insufficient data to build chart',
                details: { range },
              })
            }
          } else if (toolSelection.tool === 'getRecentFilings') {
            const limit = toolSelection.args.limit || 5
            if (limit < 1 || limit > 10) {
              flow.failStep('tool_execution', {
                summary: 'Failed to execute tool',
                why: `Invalid filings limit "${limit}"`,
                details: { limit },
              })
              sendEvent('error', { message: 'Invalid limit (must be 1-10)' })
              controller.close()
              return
            }

            const toolResult = await getRecentFilings({ limit })

            if (toolResult.error || !toolResult.data) {
              flow.failStep('tool_execution', {
                summary: 'Filings fetch failed',
                why: toolResult.error || 'No data returned',
                details: { limit },
              })
              sendEvent('error', { message: toolResult.error || 'Failed to fetch filings data' })
              controller.close()
              return
            }

            factsJson = JSON.stringify(toolResult.data, null, 2)
            dataUsed = { type: 'filings', data: toolResult.data }
          } else if (toolSelection.tool === 'searchFilings') {
            const query = toolSelection.args.query || question
            if (!query || query.trim().length === 0) {
              flow.failStep('tool_execution', {
                summary: 'Failed to execute tool',
                why: 'Search query missing',
              })
              sendEvent('error', { message: 'Search query cannot be empty' })
              controller.close()
              return
            }

            const limit = toolSelection.args.limit || 5
            if (limit < 1 || limit > 10) {
              flow.failStep('tool_execution', {
                summary: 'Failed to execute tool',
                why: `Invalid search limit "${limit}"`,
                details: { limit },
              })
              sendEvent('error', { message: 'Invalid limit (must be 1-10)' })
              controller.close()
              return
            }

            const toolResult = await searchFilings({ query, limit })

            if (toolResult.error || !toolResult.data) {
              flow.failStep('tool_execution', {
                summary: 'Filing search failed',
                why: toolResult.error || 'No data returned',
                details: { query, limit },
              })
              sendEvent('error', { message: toolResult.error || 'Failed to search filings' })
              controller.close()
              return
            }

            factsJson = JSON.stringify(toolResult.data, null, 2)
            dataUsed = { type: 'passages', data: toolResult.data }
          } else {
            flow.failStep('tool_execution', {
              summary: 'Failed to execute tool',
              why: `Unsupported tool "${toolSelection.tool}"`,
            })
            sendEvent('error', { message: 'Unsupported tool selected' })
            controller.close()
            return
          }

          const toolExecutionLatencyMs = Date.now() - toolExecutionStart

          flow.completeStep({
            step: 'tool_execution',
            status: 'success',
            summary: `Fetched ${dataUsed.data.length} ${dataUsed.type}`,
            why: `Retrieved data via ${toolSelection.tool}`,
            details: {
              tool: toolSelection.tool,
              rowCount: dataUsed.data.length,
              latencyMs: toolExecutionLatencyMs,
              chartGenerated: !!chartConfig,
            },
          })

          // Send data and chart to client
          sendEvent('data', { dataUsed, chartConfig })

          // Step 3: Stream answer generation
          sendEvent('status', { step: 'generating', message: 'Generating answer...' })
          answerGenerationStarted = true
          flow.startStep({
            step: 'answer_generation',
            group: 'answering',
            summary: 'Generating answer',
            why: 'Transforming retrieved data into final response',
            details: {
              model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            },
          })

          const answerGenerationStart = Date.now()
          const answerPrompt = buildFinalAnswerPrompt(question, factsJson)

          const formattingInstructions = [
            'You are Fin Quote analyst assistant.',
            'Use only the provided facts; never guess or pull in outside data.',
            'Respond in plain text sentences with no Markdown, bullets, bold, italics, tables, or code blocks.',
            'CRITICAL: If the answer covers more than four data points (years, filings, etc.), DO NOT list each one individually. Instead, write EXACTLY two sentences: (1) The first sentence mentions ONLY the earliest year/value and latest year/value, plus any notable high or low. (2) The second sentence describes the overall trend and tells the user to check the data table below for the full yearly breakdown. DO NOT list all the individual years in your answer text.',
            'Keep answers concise and follow user instructions precisely.',
          ].join(' ')

          const historyLimit = process.env.OPENAI_MODEL?.includes('gpt-5') ? 4 : 10
          const recentHistory = conversationHistory.slice(-historyLimit)

          const answerMessages: SimpleMessage[] = [
            { role: 'system', content: formattingInstructions },
            ...recentHistory.map((msg: any) => ({
              role: msg.role as 'user' | 'assistant',
              content: msg.content,
            })),
            {
              role: 'user',
              content: answerPrompt,
            },
          ]

          const answerStream = await openai.responses.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            input: toResponseInputMessages(answerMessages),
            ...(process.env.OPENAI_MODEL?.includes('gpt-5') ? {} : { temperature: 0 }),
            max_output_tokens: process.env.OPENAI_MODEL?.includes('gpt-5') ? 20000 : 500,
            ...(process.env.OPENAI_MODEL?.includes('gpt-5') ? { reasoning: { effort: 'minimal' } } : {}),
            stream: true,
          })

          // Stream the answer to client (Responses API returns different chunk format)
          let fullAnswer = ''
          for await (const chunk of answerStream) {
            // Responses API chunks have type field and delta for incremental updates
            const chunkType = (chunk as any).type
            if (chunkType === 'response.output_text.delta') {
              const delta = (chunk as any).delta
              if (delta) {
                fullAnswer += delta
                sendEvent('answer', { content: delta })
              }
            }
          }

          const normalizedAnswer = fullAnswer.trim()
          const answerLatencyMs = Date.now() - answerGenerationStart

          flow.completeStep({
            step: 'answer_generation',
            status: 'success',
            summary: 'Answer generated',
            why: 'Response ready to deliver to user',
            details: {
              latencyMs: answerLatencyMs,
              characters: normalizedAnswer.length,
            },
          })
          answerGenerationStarted = false

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

          validationInProgress = true
          flow.startStep({
            step: 'validation',
            group: 'data',
            summary: 'Validating answer',
            why: 'Cross-checking response against fetched data',
          })

          const validationResults = await validateAnswer(
            normalizedAnswer,
            dataUsed.data,
            checkYearInDatabase
          )

          const failingChecks = [
            validationResults.number_validation?.status !== 'pass' ? 'numbers' : null,
            validationResults.year_validation?.status !== 'pass' ? 'years' : null,
            validationResults.filing_validation?.status !== 'pass' ? 'citations' : null,
          ].filter(Boolean)

          if (validationResults.overall_passed) {
            flow.completeStep({
              step: 'validation',
              summary: 'Validation passed',
              why: 'All validation checks succeeded',
              details: {
                severity: validationResults.overall_severity,
                latencyMs: validationResults.latency_ms,
              },
            })
            validationInProgress = false
          } else {
            flow.warnStep('validation', {
              summary: 'Validation issues detected',
              why: failingChecks.length > 0 ? `Issues with ${failingChecks.join(', ')}` : 'Validation reported warnings',
              details: {
                severity: validationResults.overall_severity,
                failingChecks,
                latencyMs: validationResults.latency_ms,
              },
            })
            validationInProgress = false
          }

          // Send validation results
          sendEvent('validation', { results: validationResults })

          // Step 5: Generate follow-up questions
          sendEvent('status', { step: 'suggestions', message: 'Generating suggestions...' })
          flow.startStep({
            step: 'followup_generation',
            group: 'answering',
            summary: 'Generating follow-up suggestions',
            why: 'Providing next-step ideas for the user',
          })
          followUpInProgress = true

          let followUpQuestions: string[] = []
          let followUpHandled = false
          try {
            const followUpPrompt = buildFollowUpQuestionsPrompt(
              question,
              toolSelection.tool,
              normalizedAnswer
            )

            console.log('🔍 Generating follow-up questions...')
            const followUpMessages: SimpleMessage[] = [
              {
                role: 'system',
                content: 'You generate follow-up question suggestions. Return ONLY valid JSON matching {"suggestions": string[]}. No prose.',
              },
              {
                role: 'user',
                content: followUpPrompt,
              },
            ]

            const followUpResponse = await openai.responses.create({
              model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
              input: toResponseInputMessages(followUpMessages),
              ...(process.env.OPENAI_MODEL?.includes('gpt-5') ? {} : { temperature: 0.7 }),
              max_output_tokens: process.env.OPENAI_MODEL?.includes('gpt-5') ? 500 : 150,
              ...(process.env.OPENAI_MODEL?.includes('gpt-5') ? { reasoning: { effort: 'minimal' } } : {}),
              text: { format: { type: 'json_object' } },
            })

            // Debug: Log the full response
            console.log('🔍 Full response object:', JSON.stringify(followUpResponse, null, 2))

            const followUpContent = extractResponseText(followUpResponse)

            console.log('🔍 Follow-up content:', followUpContent)

            if (followUpContent) {
              const parsed = JSON.parse(followUpContent)
              console.log('🔍 Parsed follow-up:', parsed)

              if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
                followUpQuestions = parsed.suggestions.slice(0, 3)
                console.log('🔍 Follow-up questions to send:', followUpQuestions)
                if (followUpQuestions.length > 0) {
                  flow.completeStep({
                    step: 'followup_generation',
                    summary: `Generated ${followUpQuestions.length} follow-up questions`,
                    why: 'Model proposed suggestions for continued research',
                    details: { count: followUpQuestions.length },
                  })
                  followUpHandled = true
                  followUpInProgress = false
                }
              }
            }
          } catch (followUpError) {
            console.error('❌ Failed to generate follow-up questions:', followUpError)
            flow.warnStep('followup_generation', {
              summary: 'Follow-up generation failed',
              why: followUpError instanceof Error ? followUpError.message : 'Unknown error',
            })
            followUpHandled = true
            followUpInProgress = false
            // Continue even if follow-up generation fails
          }

          if (!followUpHandled) {
            flow.warnStep('followup_generation', {
              summary: 'No follow-up questions',
              why: 'Model did not return suggestions',
            })
            followUpHandled = true
            followUpInProgress = false
          }

          // Send follow-up questions to client
          if (followUpQuestions.length > 0) {
            console.log('📤 Sending follow-up event with questions:', followUpQuestions)
            sendEvent('followup', { questions: followUpQuestions })
          } else {
            console.log('⚠️ No follow-up questions to send')
          }

          // Log query to database for Recent Queries sidebar
          try {
            const { data: { user } } = await supabase.auth.getUser()
            await logQuery({
              sessionId,
              userId: user?.id || null,
              userQuestion: question,
              toolSelected: toolSelection.tool,
              toolArgs: toolSelection.args,
              toolSelectionLatencyMs,
              dataReturned: dataUsed.data,
              dataRowCount: dataUsed.data.length,
              toolExecutionLatencyMs,
              answerGenerated: normalizedAnswer,
              answerLatencyMs,
              validationResults,
            })
          } catch (logError) {
            console.error('Failed to log query:', logError)
            // Don't fail the request if logging fails
          }

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
          const errorMessage = error instanceof Error ? error.message : 'Unexpected streaming failure'

          if (answerGenerationStarted) {
            flow.failStep('answer_generation', {
              summary: 'Pipeline error',
              why: errorMessage,
            })
            answerGenerationStarted = false
          }

          if (validationInProgress) {
            flow.failStep('validation', {
              summary: 'Validation aborted',
              why: errorMessage,
            })
            validationInProgress = false
          }

          if (followUpInProgress) {
            flow.warnStep('followup_generation', {
              summary: 'Follow-up skipped',
              why: 'Pipeline ended due to error',
            })
            followUpInProgress = false
          }

          sendEvent('error', {
            message: errorMessage
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
