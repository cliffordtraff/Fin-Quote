import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { getAaplFinancialsByMetric, FinancialMetric } from '@/app/actions/financials'
import { getAaplPrices, PriceParams } from '@/app/actions/prices'
import { getRecentFilings } from '@/app/actions/filings'
import { buildToolSelectionMessages, buildFinalAnswerPrompt, buildFollowUpQuestionsPrompt } from '@/lib/tools'
import { generateFinancialChart, generatePriceChart } from '@/lib/chart-helpers'
import { validateAnswer } from '@/lib/validators'
import { logQuery } from '@/lib/query-logs'
import { createFlowEmitter } from '@/lib/flow/events'
import {
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
  requireCurrentUserContext,
} from '@/lib/auth/current-user'
import {
  ChatbotRequestTooLargeError,
  ChatbotRequestValidationError,
  isChatbotEnabled,
  readChatbotRequest,
} from '@/lib/chatbot/request-policy'
import {
  CHAT_ANSWER_MAX_OUTPUT_TOKENS,
  CHATBOT_AUTH_DEADLINE_MS,
  CHATBOT_EXPECTED_USER_HEADER,
  CHATBOT_MINIMUM_AUTH_VALIDITY_SECONDS,
  CHAT_FOLLOW_UP_MAX_OUTPUT_TOKENS,
  CHAT_ROUTING_MAX_OUTPUT_TOKENS,
} from '@/lib/chatbot/constants'
import { chatbotCommandOriginResponse } from '@/lib/chatbot/command-origin'
import {
  ChatbotAdmissionError,
  reserveChatbotRequest,
} from '@/lib/chatbot/admission'
import {
  acquireDurableChatbotAdmission,
  failDurableChatbotAdmission,
  resolveDurableChatbotAdmission,
  ChatbotDurableAdmissionUnavailableError,
  type ChatbotDurableAdmission,
} from '@/lib/chatbot/durable-admission'
import { completeChatbotTurnAndRequest } from '@/lib/chatbot/complete-turn'
import {
  MAX_CHATBOT_ANSWER_CHARACTERS,
  parseChatbotFollowUpQuestions,
  parseChatbotToolSelection,
} from '@/lib/chatbot/model-contracts'
import { registerChatbotBackgroundTask } from '@/lib/chatbot/background-work'
import { preflightChatbotConversationTarget } from '@/lib/chatbot/target-preflight'
import { fingerprintChatbotRequest } from '@/lib/chatbot/request-fingerprint'
import {
  CHATBOT_ASSISTANT_MESSAGE_MAX_BYTES,
  chatbotTurnPersistenceMetadataSchema,
} from '@/lib/chatbot/conversation-contract'
import { replaceInvalidPostgresText } from '@/lib/chatbot/postgres-text'

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
// Keep this literal so Next can statically analyze the route configuration.
export const maxDuration = 120

const PRIVATE_NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
} as const

function privateJson(
  body: Record<string, unknown>,
  status: number,
  extraHeaders?: Record<string, string>,
): Response {
  return Response.json(body, {
    status,
    headers: { ...PRIVATE_NO_STORE_HEADERS, ...extraHeaders },
  })
}

function admissionErrorResponse(error: ChatbotAdmissionError): Response {
  return privateJson(
    { error: error.message, code: error.code },
    error.status,
    { 'Retry-After': String(error.retryAfterSeconds) },
  )
}

function throwIfAborted(signal: AbortSignal): void {
  signal.throwIfAborted()
}

function completedReplayResponse(admission: ChatbotDurableAdmission): Response {
  const event = `event: complete\ndata: ${JSON.stringify({
    replayed: true,
    conversationId: admission.conversationId,
    revision: admission.revision,
    queryLogId: null,
  })}\n\n`
  return new Response(event, {
    headers: {
      'Content-Type': 'text/event-stream',
      ...PRIVATE_NO_STORE_HEADERS,
      'Connection': 'keep-alive',
    },
  })
}

function durableAdmissionResponse(admission: ChatbotDurableAdmission): Response {
  const retryAfter = Math.max(1, admission.retryAfterSeconds || 1)
  switch (admission.disposition) {
    case 'in_progress':
    case 'owner_capacity':
      return privateJson(
        { error: 'A chatbot request is already active for this account.', code: 'CHATBOT_SCOPE_BUSY' },
        429,
        { 'Retry-After': String(retryAfter) },
      )
    case 'global_capacity':
      return privateJson(
        { error: 'Chatbot capacity is temporarily exhausted.', code: 'CHATBOT_CAPACITY' },
        503,
        { 'Retry-After': String(retryAfter) },
      )
    case 'rate_limited':
      return privateJson(
        { error: 'Too many chatbot requests. Please retry later.', code: 'CHATBOT_RATE_LIMIT' },
        429,
        { 'Retry-After': String(retryAfter) },
      )
    case 'identity_capacity':
      return privateJson(
        { error: 'This account has reached its retained chatbot request limit.', code: 'CHATBOT_IDEMPOTENCY_CAPACITY' },
        429,
      )
    case 'attempts_exhausted':
      return privateJson(
        { error: 'This chatbot request exhausted its recovery attempts.', code: 'CHATBOT_RETRY_EXHAUSTED' },
        409,
      )
    case 'failed':
      return privateJson(
        { error: 'This chatbot request key was already consumed.', code: 'CHATBOT_REQUEST_SETTLED' },
        409,
      )
    case 'key_conflict':
      return privateJson(
        { error: 'This chatbot request key belongs to a different request.', code: 'CHATBOT_KEY_CONFLICT' },
        409,
      )
    default:
      return privateJson(
        { error: 'Chatbot admission storage returned an invalid result.' },
        503,
        { 'Retry-After': '2' },
      )
  }
}

export async function POST(req: NextRequest) {
  const originFailure = chatbotCommandOriginResponse(req)
  if (originFailure) return originFailure

  const encoder = new TextEncoder()

  try {
    if (!isChatbotEnabled()) {
      return privateJson({ error: 'Chatbot is not available.' }, 404)
    }

    let authenticatedRequest: Awaited<ReturnType<typeof requireCurrentUserContext>>
    const authController = new AbortController()
    const authTimer = setTimeout(() => {
      authController.abort(new DOMException(
        'Chatbot authentication exceeded its deadline.',
        'TimeoutError',
      ))
    }, CHATBOT_AUTH_DEADLINE_MS)
    const authSignal = req.signal.aborted
      ? req.signal
      : AbortSignal.any([req.signal, authController.signal])
    try {
      authenticatedRequest = await requireCurrentUserContext({
        signal: authSignal,
        minimumValiditySeconds: CHATBOT_MINIMUM_AUTH_VALIDITY_SECONDS,
      })
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        if (error.reason === 'expiring') {
          return privateJson(
            {
              error: 'Refresh the current session before starting this request.',
              code: 'CHATBOT_AUTH_REFRESH_REQUIRED',
            },
            401,
            { 'Retry-After': '1' },
          )
        }
        return privateJson({ error: 'Sign in to use the chatbot.' }, 401)
      }
      if (
        error instanceof AuthenticationUnavailableError ||
        authController.signal.aborted ||
        req.signal.aborted
      ) {
        return privateJson(
          {
            error: 'Chatbot authentication is temporarily unavailable.',
            code: 'CHATBOT_AUTH_UNAVAILABLE',
          },
          503,
          { 'Retry-After': '2' },
        )
      }
      throw error
    } finally {
      clearTimeout(authTimer)
    }
    const currentUser = authenticatedRequest.user

    const expectedUserId = req.headers.get(CHATBOT_EXPECTED_USER_HEADER)
    if (
      !expectedUserId
      || expectedUserId.length > 128
      || !/^[A-Za-z0-9_-]+$/.test(expectedUserId)
      || expectedUserId !== currentUser.id
    ) {
      return privateJson(
        {
          error: 'The signed-in account changed before this request started.',
          code: 'CHATBOT_PRINCIPAL_MISMATCH',
        },
        409,
      )
    }

    let requestPayload: Awaited<ReturnType<typeof readChatbotRequest>>
    try {
      requestPayload = await readChatbotRequest(req)
    } catch (error) {
      if (error instanceof ChatbotRequestTooLargeError) {
        return privateJson({ error: error.message }, 413)
      }
      if (error instanceof ChatbotRequestValidationError) {
        return privateJson({ error: error.message }, 400)
      }
      throw error
    }

    const {
      question,
      conversationHistory,
      sessionId,
      idempotencyKey,
      conversationId,
      expectedRevision,
    } = requestPayload

    const fingerprint = await fingerprintChatbotRequest({
      question,
      conversationHistory,
      sessionId,
      conversationId,
      expectedRevision,
    })
    let durableAdmission: ChatbotDurableAdmission
    try {
      durableAdmission = await acquireDurableChatbotAdmission({
        ownerId: currentUser.id,
        idempotencyKey,
        requestFingerprint: fingerprint,
      })
    } catch (error) {
      if (error instanceof ChatbotDurableAdmissionUnavailableError) {
        return privateJson(
          { error: error.message, code: 'CHATBOT_ADMISSION_UNAVAILABLE' },
          503,
          { 'Retry-After': '2' },
        )
      }
      throw error
    }
    if (durableAdmission.disposition === 'completed') {
      return completedReplayResponse(durableAdmission)
    }
    if (durableAdmission.disposition !== 'acquired' || !durableAdmission.leaseToken) {
      return durableAdmissionResponse(durableAdmission)
    }
    const durableLeaseIdentity = {
      ownerId: currentUser.id,
      idempotencyKey,
      requestFingerprint: fingerprint,
      leaseToken: durableAdmission.leaseToken,
    }

    // Capture the auth-bound client while the Next request context (cookies)
    // is active. The stream later uses it for validation and the atomic combo.
    const userSupabase = authenticatedRequest.client

    const preflight = await preflightChatbotConversationTarget(
      userSupabase,
      { conversationId, expectedRevision },
      req.signal,
    )
    if (preflight.status !== 'ready') {
      await failDurableChatbotAdmission(durableLeaseIdentity).catch(() => undefined)
      switch (preflight.status) {
        case 'not_found':
          return privateJson(
            {
              error: 'Conversation not found.',
              code: 'CHATBOT_CONVERSATION_NOT_FOUND',
            },
            404,
          )
        case 'revision_conflict':
          return privateJson(
            {
              error: 'This conversation changed in another tab.',
              code: 'CHATBOT_REVISION_CONFLICT',
            },
            409,
          )
        case 'conversation_quota':
          return privateJson(
            {
              error: 'Your conversation limit has been reached.',
              code: 'CHATBOT_CONVERSATION_QUOTA',
            },
            429,
          )
        case 'message_quota':
          return privateJson(
            {
              error: 'This conversation has reached its message limit.',
              code: 'CHATBOT_MESSAGE_QUOTA',
            },
            429,
          )
        case 'command_quota':
          return privateJson(
            {
              error: 'Your retained chatbot command limit has been reached.',
              code: 'CHATBOT_COMMAND_QUOTA',
            },
            429,
          )
        default:
          return privateJson(
            {
              error: 'Conversation storage is temporarily unavailable.',
              code: 'CHATBOT_CONVERSATION_UNAVAILABLE',
            },
            503,
            { 'Retry-After': '2' },
          )
      }
    }

    let lease
    try {
      lease = reserveChatbotRequest(currentUser.id)
    } catch (error) {
      await failDurableChatbotAdmission(durableLeaseIdentity).catch(() => undefined)
      if (error instanceof ChatbotAdmissionError) {
        return admissionErrorResponse(error)
      }
      throw error
    }

    let streamClosed = false
    let preserveCompletedAnswer = false
    const stream = new ReadableStream({
      async start(controller) {
        const closeStream = () => {
          if (streamClosed) return
          streamClosed = true
          try {
            controller.close()
          } catch {
            // The browser may have cancelled the stream first.
          }
        }

        // Helper to send JSON events
        const sendEvent = (event: string, data: any, force = false) => {
          if (streamClosed || (!force && lease.signal.aborted)) return
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
          } catch (error) {
            streamClosed = true
            lease.abortCaller(error)
          }
        }

        const detachTimeout = lease.onTimeout(error => {
          sendEvent('error', {
            message: error.message,
            code: error.code,
            status: error.status,
            retryAfterSeconds: error.retryAfterSeconds,
            retryable: true,
          }, true)
          closeStream()
        })

        const onRequestAbort = () => {
          if (!preserveCompletedAnswer) lease.abortCaller(req.signal.reason)
          closeStream()
        }
        if (req.signal.aborted) onRequestAbort()
        else req.signal.addEventListener('abort', onRequestAbort, { once: true })

        let durableTerminallySettled = false
        try {
          await lease.start(async signal => {
            const flow = createFlowEmitter(flowEvent => {
              sendEvent('flow', flowEvent)
            })

            let answerGenerationStarted = false
            let validationInProgress = false
            let followUpInProgress = false
            const embeddingTokens = 0

            try {
              throwIfAborted(signal)
          flow.startStep({
            step: 'tool_selection',
            group: 'planning',
            summary: 'Selecting best tool',
            why: 'Analyzing question and recent history',
            details: { question },
          })

          // Step 1: Tool selection (non-streaming)
          const toolSelectionStart = Date.now()

          // Build messages with caching-friendly structure:
          // [system: static prompt (cached)] + [conversation history] + [user: question]
          const baseMessages = buildToolSelectionMessages(question)
          const selectionMessages: SimpleMessage[] = [
            baseMessages[0], // system message with static prompt (will be cached by OpenAI)
            ...conversationHistory.slice(-10).map((msg: any) => ({
              role: msg.role as 'user' | 'assistant',
              content: msg.content,
            })),
            baseMessages[1], // user message with just the question
          ]

          throwIfAborted(signal)
          const selectionResponse = await openai.responses.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            input: toResponseInputMessages(selectionMessages),
            ...(process.env.OPENAI_MODEL?.includes('gpt-5') ? {} : { temperature: 0 }),
            max_output_tokens: process.env.OPENAI_MODEL?.includes('gpt-5')
              ? CHAT_ROUTING_MAX_OUTPUT_TOKENS
              : 150,
            ...(process.env.OPENAI_MODEL?.includes('gpt-5') ? { reasoning: { effort: 'minimal' } } : {}),
            text: { format: { type: 'json_object' } },
          }, { signal })
          throwIfAborted(signal)

          const selectionContent = extractResponseText(selectionResponse)


          if (!selectionContent) {
            flow.failStep('tool_selection', {
              summary: 'Tool selection failed',
              why: 'No content returned from model',
            })
            sendEvent('error', { message: 'Failed to select tool' })
            closeStream()
            return
          }

          let toolSelection: ReturnType<typeof parseChatbotToolSelection>
          try {
            toolSelection = parseChatbotToolSelection(selectionContent)
            console.log('🔧 Tool selection:', JSON.stringify(toolSelection, null, 2))
          } catch {
            flow.failStep('tool_selection', {
              summary: 'Tool selection failed',
              why: 'Model returned a tool selection outside the allowed contract',
            })
            sendEvent('error', { message: 'Failed to validate tool selection' })
            closeStream()
            return
          }

          const selectionReason = toolSelection.reasoning

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
          const toolExecutionStart = Date.now()
          let factsJson: string
          let dataUsed: { type: 'financials' | 'prices' | 'filings' | 'passages' | 'metrics_catalog' | 'financial_metrics'; data: any[] }
          let chartConfig: any = null
          let validationSymbol = 'AAPL'

          // Execute the selected tool
          if (
            toolSelection.tool === 'getFinancialsByMetric' ||
            toolSelection.tool === 'getAaplFinancialsByMetric'
          ) {
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
              closeStream()
              return
            }

            // Extract period and quarters from args
            const period = (toolSelection.args.period as 'annual' | 'quarterly') || 'annual'
            const quarters = toolSelection.args.quarters as number[] | undefined
            const defaultLimit = period === 'quarterly' ? 12 : 4

            const toolResult = await getAaplFinancialsByMetric(
              {
                metric,
                limit: toolSelection.args.limit || defaultLimit,
                period,
                quarters,
              },
              { signal },
            )
            throwIfAborted(signal)

            if (toolResult.error || !toolResult.data) {
              flow.failStep('tool_execution', {
                summary: 'Financial data fetch failed',
                why: toolResult.error || 'No data returned',
                details: { metric },
              })
              sendEvent('error', { message: toolResult.error || 'Failed to fetch financial data' })
              closeStream()
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
            // Only support custom date ranges
            if (!('from' in toolSelection.args)) {
              flow.failStep('tool_execution', {
                summary: 'Failed to execute tool',
                why: 'Invalid getPrices args: must have from date',
                details: toolSelection.args,
              })
              sendEvent('error', { message: 'Invalid getPrices args: must have from date' })
              closeStream()
              return
            }

            const from = toolSelection.args.from as string
            const to = toolSelection.args.to as string | undefined

            // Basic date format validation
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/
            if (!dateRegex.test(from)) {
              flow.failStep('tool_execution', {
                summary: 'Failed to execute tool',
                why: `Invalid from date format "${from}"`,
                details: { from },
              })
              sendEvent('error', { message: 'Invalid from date format' })
              closeStream()
              return
            }
            if (to && !dateRegex.test(to)) {
              flow.failStep('tool_execution', {
                summary: 'Failed to execute tool',
                why: `Invalid to date format "${to}"`,
                details: { to },
              })
              sendEvent('error', { message: 'Invalid to date format' })
              closeStream()
              return
            }

            const priceParams: PriceParams = { symbol: 'AAPL', from, ...(to ? { to } : {}) }
            const chartLabel = `${from} to ${to || 'today'}`

            const toolResult = await getAaplPrices(priceParams, { signal })
            throwIfAborted(signal)

            if (toolResult.error || !toolResult.data) {
              flow.failStep('tool_execution', {
                summary: 'Price data fetch failed',
                why: toolResult.error || 'No data returned',
                details: priceParams,
              })
              sendEvent('error', { message: toolResult.error || 'Failed to fetch price data' })
              closeStream()
              return
            }

            // Limit data sent to LLM and client to prevent JSON serialization errors
            // For large datasets, provide summary statistics instead of all data points
            const MAX_PRICE_POINTS_FOR_LLM = 50
            let dataForLLM: any
            let dataForClient: any

            if (toolResult.data.length > MAX_PRICE_POINTS_FOR_LLM) {
              // Provide summary data instead of all points
              // Note: data is sorted most recent first (descending by date)
              const mostRecent = toolResult.data[0]
              const oldest = toolResult.data[toolResult.data.length - 1]
              const prices = toolResult.data.map(d => d.close)
              const high = Math.max(...prices)
              const low = Math.min(...prices)

              // Calculate percentage change
              const percentChange = ((mostRecent.close - oldest.close) / oldest.close) * 100

              const summaryData = {
                summary: `${toolResult.data.length} daily price records`,
                dateRange: { from: oldest.date, to: mostRecent.date },
                priceRange: { high, low, startPrice: oldest.close, endPrice: mostRecent.close },
                percentChange: percentChange,
                note: "Full price data available in chart"
              }

              dataForLLM = summaryData
              dataForClient = summaryData  // Send summary to client too to prevent streaming errors
              console.log('📊 Using SUMMARY for LLM & client:', toolResult.data.length, 'records →', JSON.stringify(summaryData).length, 'chars')
            } else {
              dataForLLM = toolResult.data
              dataForClient = toolResult.data
              console.log('📊 Using FULL data for LLM & client:', toolResult.data.length, 'records')
            }

            factsJson = JSON.stringify(dataForLLM)  // NO pretty-printing (no , null, 2)
            dataUsed = { type: 'prices', data: dataForClient }
            flow.startStep({
              step: 'chart_generation',
              group: 'answering',
              summary: `Preparing ${chartLabel} price chart`,
              why: 'Visualizing price movement',
              details: { priceParams, source: 'prices' },
            })
            chartConfig = generatePriceChart(toolResult.data, chartLabel)  // Chart still gets full dataset
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
                details: { chartLabel, pointCount },
              })
            } else {
              flow.warnStep('chart_generation', {
                summary: 'Chart not generated',
                why: 'Insufficient data to build chart',
                details: { chartLabel },
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
              closeStream()
              return
            }

            const toolResult = await getRecentFilings(
              { ticker: 'AAPL', limit },
              { signal },
            )
            throwIfAborted(signal)

            if (toolResult.error || !toolResult.data) {
              flow.failStep('tool_execution', {
                summary: 'Filings fetch failed',
                why: toolResult.error || 'No data returned',
                details: { limit },
              })
              sendEvent('error', { message: toolResult.error || 'Failed to fetch filings data' })
              closeStream()
              return
            }

          factsJson = JSON.stringify(toolResult.data, null, 2)
          dataUsed = { type: 'filings', data: toolResult.data }
        } else if (toolSelection.tool === 'searchFilings') {
          flow.failStep('tool_execution', {
            summary: 'Filing search disabled',
            why: 'Filing content search is temporarily unavailable',
            details: { query: toolSelection.args.query, limit: toolSelection.args.limit },
          })
          sendEvent('error', {
            message:
              'Filing content search is temporarily unavailable. I can share filing dates/types or financial metrics instead.',
          })
          closeStream()
          return
        } else if (toolSelection.tool === 'listMetrics') {
          throwIfAborted(signal)
          const { listMetrics } = await import('@/app/actions/list-metrics')
          throwIfAborted(signal)
          const category = toolSelection.args.category as string | undefined

            const toolResult = await listMetrics(
              category ? { category } : undefined,
              { signal },
            )
            throwIfAborted(signal)

            if (toolResult.error || !toolResult.data) {
              flow.failStep('tool_execution', {
                summary: 'Metrics catalog fetch failed',
                why: toolResult.error || 'No data returned',
                details: { category },
              })
              sendEvent('error', { message: toolResult.error || 'Failed to list metrics' })
              closeStream()
              return
            }

            factsJson = JSON.stringify(toolResult.data, null, 2)
            dataUsed = { type: 'metrics_catalog', data: toolResult.data }
          } else if (toolSelection.tool === 'getFinancialMetric') {
            throwIfAborted(signal)
            const { getFinancialMetrics } = await import('@/app/actions/get-financial-metric')
            throwIfAborted(signal)
            const metricNames = toolSelection.args.metricNames as string[]
            const selectedSymbol = toolSelection.args.symbol ?? 'AAPL'
            validationSymbol = selectedSymbol
            const period = (toolSelection.args.period as 'annual' | 'quarterly' | 'ttm') || 'annual'
            const quarters = toolSelection.args.quarters as number[] | undefined

            // TTM doesn't use limit (returns single value per metric)
            const defaultLimit = period === 'ttm' ? 1 : period === 'quarterly' ? 12 : 5
            const maxLimit = period === 'ttm' ? 1 : period === 'quarterly' ? 40 : 20
            const limit = period === 'ttm' ? 1 : (toolSelection.args.limit || defaultLimit)

            if (!metricNames || metricNames.length === 0) {
              flow.failStep('tool_execution', {
                summary: 'Failed to execute tool',
                why: 'No metrics specified',
              })
              sendEvent('error', { message: 'No metrics specified' })
              closeStream()
              return
            }

            if (limit < 1 || limit > maxLimit) {
              flow.failStep('tool_execution', {
                summary: 'Failed to execute tool',
                why: `Invalid limit "${limit}"`,
                details: { limit },
              })
              sendEvent('error', { message: `Invalid limit (must be 1-${maxLimit})` })
              closeStream()
              return
            }

            const toolResult = await getFinancialMetrics(
              {
                symbol: selectedSymbol,
                metricNames,
                limit,
                period,
                quarters,
              },
              { signal },
            )
            throwIfAborted(signal)

            if (toolResult.error || !toolResult.data) {
              flow.failStep('tool_execution', {
                summary: 'Financial metrics fetch failed',
                why: toolResult.error || 'No data returned',
                details: { metricNames, unresolved: toolResult.unresolved },
              })
              sendEvent('error', { message: toolResult.error || 'Failed to fetch financial metrics' })
              closeStream()
              return
            }

            factsJson = JSON.stringify(toolResult.data, null, 2)
            dataUsed = { type: 'financial_metrics', data: toolResult.data }

            // Generate chart for metrics that benefit from visualization
            // Categories: Growth, Profitability & Returns, Valuation, Per-Share Metrics, Market Data, Efficiency
            const shouldGenerateChart = (category: string, metricName: string): boolean => {
              const chartCategories = [
                'Growth',
                'Profitability & Returns',
                'Valuation',
                'Per-Share Metrics',
                'Market Data',
                'Efficiency & Working Capital',
              ]

              // Also include specific "Other" metrics that are actually valuation metrics
              const valuationMetricsInOther = [
                'peRatio', // Price to Earnings
                'pbRatio', // Price to Book
                'priceSalesRatio', // Price to Sales
                'priceCashFlowRatio',
                'priceEarningsToGrowthRatio', // PEG Ratio
                'pfcfRatio', // Price to Free Cash Flow
                'pocfratio', // Price to Operating Cash Flow
                'ptbRatio', // Price to Tangible Book
                'enterpriseValueMultiple', // EV/EBITDA
              ]

              return chartCategories.includes(category) ||
                     (category === 'Other' && valuationMetricsInOther.includes(metricName))
            }

            // Check if we should generate a chart (only for single metric queries)
            if (toolResult.data.length > 0 && metricNames.length === 1) {
              const firstRow = toolResult.data[0]
              const category = firstRow.metric_category
              const metricName = firstRow.metric_name

              if (category && shouldGenerateChart(category, metricName)) {
                flow.startStep({
                  step: 'chart_generation',
                  group: 'answering',
                  summary: `Preparing ${metricName} chart`,
                  why: 'Visualizing metric trend over time',
                  details: { metric: metricName, category, source: 'financial_metrics' },
                })

                // Transform data to chart format
                const sortedData = toolResult.data.sort((a: any, b: any) => a.year - b.year)

                // Determine chart type based on metric name/category
                const isPercentage = metricName.toLowerCase().includes('margin') ||
                  metricName.toLowerCase().includes('yield') ||
                  metricName.toLowerCase().includes('growth') ||
                  metricName.toLowerCase().includes('return')

                chartConfig = {
                  type: 'line',
                  categories: sortedData.map((row: any) => row.year.toString()),
                  data: sortedData.map((row: any) => row.metric_value),
                  xAxisLabel: 'Year',
                  yAxisLabel: isPercentage ? 'Percentage (%)' : 'Value',
                  title: `${selectedSymbol} ${metricName}`,
                  color: '#3b82f6',
                }

                flow.completeStep({
                  step: 'chart_generation',
                  summary: `Prepared line chart`,
                  why: 'Chart ready for display alongside answer',
                  details: { metric: metricName, pointCount: sortedData.length },
                })
              }
            }
          } else {
            flow.failStep('tool_execution', {
              summary: 'Failed to execute tool',
              why: `Unsupported tool "${toolSelection.tool}"`,
            })
            sendEvent('error', { message: 'Unsupported tool selected' })
            closeStream()
            return
          }

          const toolExecutionLatencyMs = Date.now() - toolExecutionStart

          // Tool data and generated charts become part of the same atomic turn.
          // Reject a deterministic persistence mismatch before starting the
          // paid answer model rather than streaming an answer that cannot commit.
          const boundedMetadata = chatbotTurnPersistenceMetadataSchema.safeParse({
            chartConfig,
            dataUsed,
          })
          if (!boundedMetadata.success) {
            flow.failStep('tool_execution', {
              summary: 'Tool result exceeded the conversation storage limit',
              why: boundedMetadata.error.issues[0]?.message ??
                'Tool result could not be retained safely',
            })
            sendEvent('error', {
              message: 'The requested data is too large to retain safely. Try a shorter range.',
            })
            closeStream()
            return
          }
          chartConfig = boundedMetadata.data.chartConfig
          dataUsed = boundedMetadata.data.dataUsed as typeof dataUsed

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

          throwIfAborted(signal)
          const answerStream = await openai.responses.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            input: toResponseInputMessages(answerMessages),
            ...(process.env.OPENAI_MODEL?.includes('gpt-5') ? {} : { temperature: 0 }),
            max_output_tokens: process.env.OPENAI_MODEL?.includes('gpt-5')
              ? CHAT_ANSWER_MAX_OUTPUT_TOKENS
              : 500,
            ...(process.env.OPENAI_MODEL?.includes('gpt-5') ? { reasoning: { effort: 'minimal' } } : {}),
            stream: true,
          }, { signal })
          throwIfAborted(signal)

          // Stream the answer to client (Responses API returns different chunk format)
          let fullAnswer = ''
          let fullAnswerBytes = 0
          for await (const chunk of answerStream) {
            throwIfAborted(signal)
            // Responses API chunks have type field and delta for incremental updates
            const chunkType = (chunk as any).type
            if (chunkType === 'response.output_text.delta') {
              const rawDelta = (chunk as any).delta
              if (typeof rawDelta !== 'string') {
                throw new Error('The model returned an invalid answer chunk.')
              }
              const delta = replaceInvalidPostgresText(rawDelta)
              const deltaBytes = encoder.encode(delta).byteLength
              if (
                fullAnswer.length + delta.length > MAX_CHATBOT_ANSWER_CHARACTERS ||
                fullAnswerBytes + deltaBytes > CHATBOT_ASSISTANT_MESSAGE_MAX_BYTES
              ) {
                throw new Error('The model answer exceeded its size limit.')
              }
              if (delta) {
                fullAnswer += delta
                fullAnswerBytes += deltaBytes
                sendEvent('answer', { content: delta })
              }
            }
          }
          preserveCompletedAnswer = fullAnswer.trim().length > 0
          throwIfAborted(signal)

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
          const supabase = userSupabase
          throwIfAborted(signal)

          const checkYearInDatabase = async (year: number): Promise<boolean> => {
            try {
              const query = supabase
                .from('financials_std')
                .select('year')
                .eq('symbol', validationSymbol)
                .eq('year', year)
                .limit(1)
                .abortSignal(signal)

              const { data, error } = await query
              throwIfAborted(signal)

              if (error) return false
              return data && data.length > 0
            } catch (error) {
              if (signal.aborted) throw signal.reason ?? error
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
          throwIfAborted(signal)

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

            throwIfAborted(signal)
            const followUpResponse = await openai.responses.create({
              model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
              input: toResponseInputMessages(followUpMessages),
              ...(process.env.OPENAI_MODEL?.includes('gpt-5') ? {} : { temperature: 0.7 }),
              max_output_tokens: process.env.OPENAI_MODEL?.includes('gpt-5')
                ? CHAT_FOLLOW_UP_MAX_OUTPUT_TOKENS
                : 150,
              ...(process.env.OPENAI_MODEL?.includes('gpt-5') ? { reasoning: { effort: 'minimal' } } : {}),
              text: { format: { type: 'json_object' } },
            }, { signal })
            throwIfAborted(signal)

            // Debug: Log the full response
            console.log('🔍 Full response object:', JSON.stringify(followUpResponse, null, 2))

            const followUpContent = extractResponseText(followUpResponse)

            console.log('🔍 Follow-up content:', followUpContent)

            if (followUpContent) {
              followUpQuestions = parseChatbotFollowUpQuestions(followUpContent)
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
          } catch (followUpError) {
            if (signal.aborted) throw signal.reason ?? followUpError
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
          throwIfAborted(signal)
          let queryLogId: string | null = null
          try {
            queryLogId = await logQuery({
              sessionId,
              userId: currentUser.id,
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
              embeddingTokens,
            }, { signal })
            throwIfAborted(signal)
          } catch (logError) {
            if (signal.aborted) throw signal.reason ?? logError
            console.error('Failed to log query:', logError)
            // Don't fail the request if logging fails
          }

          // One auth-bound transaction persists the bounded turn and marks the
          // durable ask completed with a content-free conversation pointer.
          // Its deadline is independent from a consumer disconnect.
          const persisted = await completeChatbotTurnAndRequest(userSupabase, {
            conversationId,
            expectedRevision,
            idempotencyKey,
            userContent: question,
            assistantContent: normalizedAnswer,
            chartConfig,
            followUpQuestions,
            dataUsed,
            admissionRequestFingerprint: fingerprint,
            leaseToken: durableLeaseIdentity.leaseToken,
          })
          if (persisted.status === 'unavailable') {
            // The transaction may have committed even if its HTTP response was
            // lost. Fence failure first, then resolve the exact identity using
            // a read-only RPC that can never reclaim/start another lease.
            const failureDisposition = await failDurableChatbotAdmission(
              durableLeaseIdentity,
            ).catch(() => null)
            const resolution = await resolveDurableChatbotAdmission({
              ownerId: durableLeaseIdentity.ownerId,
              idempotencyKey: durableLeaseIdentity.idempotencyKey,
              requestFingerprint: durableLeaseIdentity.requestFingerprint,
            }).catch(() => null)

            if (
              resolution?.disposition === 'completed' &&
              resolution.conversationId &&
              resolution.revision !== null
            ) {
              durableTerminallySettled = true
              sendEvent('complete', {
                answer: fullAnswer,
                queryLogId,
                conversationId: resolution.conversationId,
                revision: resolution.revision,
                replayed: true,
              })
              closeStream()
              return
            }

            if (
              failureDisposition === 'failed' ||
              resolution?.disposition === 'failed'
            ) {
              durableTerminallySettled = true
              throw new Error(persisted.error)
            }

            if (resolution?.disposition === 'in_progress' || resolution === null) {
              sendEvent('error', {
                message: 'The answer may still be saving. Retrying with the same request key.',
                code: 'CHATBOT_COMPLETION_UNCERTAIN',
                retryable: true,
              })
              closeStream()
              return
            }

            durableTerminallySettled = true
            throw new Error(persisted.error)
          }
          // The combo atomically marks non-success turn dispositions failed.
          durableTerminallySettled = true
          if (
            !['applied', 'replayed'].includes(persisted.disposition) ||
            !persisted.conversationId ||
            persisted.revision === null
          ) {
            throw new Error(
              persisted.disposition === 'revision_conflict'
                ? 'This conversation changed in another tab. Reload it before sending again.'
                : persisted.disposition === 'conversation_quota'
                  ? 'Your conversation limit has been reached.'
                  : persisted.disposition === 'message_quota'
                    ? 'This conversation has reached its message limit.'
                    : 'The answer could not be added to conversation history.',
            )
          }

          // Send completion only after the atomic turn + admission receipt.
          sendEvent('complete', {
            answer: fullAnswer,
            queryLogId,
            conversationId: persisted.conversationId,
            revision: persisted.revision,
            replayed: persisted.disposition === 'replayed',
            latency: {
              toolSelection: toolSelectionLatencyMs,
              toolExecution: toolExecutionLatencyMs,
              answerGeneration: answerLatencyMs,
            }
          })

              closeStream()
            } catch (error) {
              if (signal.aborted) {
                closeStream()
                return
              }
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
              closeStream()
            } finally {
              if (!durableTerminallySettled) {
                try {
                  await failDurableChatbotAdmission(durableLeaseIdentity)
                } catch (settlementError) {
                  console.error(
                    '[chatbot] Failed to settle durable admission lease:',
                    settlementError,
                  )
                }
              }
            }
          })
        } finally {
          detachTimeout()
          req.signal.removeEventListener('abort', onRequestAbort)
        }
      },
      cancel(reason) {
        streamClosed = true
        if (!preserveCompletedAnswer) lease.abortCaller(reason)
      },
    })
    // ReadableStream.start runs synchronously through lease.start during
    // construction. Register physical completion before returning the SSE so
    // Next keeps settlement/capacity cleanup alive after disconnect or timeout.
    registerChatbotBackgroundTask(lease.physicalCompletion)

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        ...PRIVATE_NO_STORE_HEADERS,
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Request error:', error)
    return privateJson(
      { error: error instanceof Error ? error.message : 'An unexpected error occurred' },
      500,
    )
  }
}
