import {
  createChatbotIdempotencyKey,
  isCurrentChatbotIdempotencyKey,
} from './idempotency-key'

export const MAX_CHATBOT_SSE_BUFFER_CHARACTERS = 1_048_576

export class ChatbotSseFrameTooLargeError extends Error {
  constructor() {
    super('The chatbot stream returned an oversized event.')
    this.name = 'ChatbotSseFrameTooLargeError'
  }
}

export interface ChatbotSseEvent {
  event: string
  data: unknown
}

export type ChatbotCompletionReceipt = {
  conversationId: string
  revision: number
  replayed: boolean
}

const CONVERSATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function parseChatbotCompletionReceipt(
  value: unknown,
): ChatbotCompletionReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The chatbot returned an invalid completion receipt.')
  }
  const row = value as Record<string, unknown>
  if (
    typeof row.conversationId !== 'string' ||
    !CONVERSATION_ID_PATTERN.test(row.conversationId) ||
    typeof row.revision !== 'number' ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 0 ||
    (row.replayed !== undefined && typeof row.replayed !== 'boolean')
  ) {
    throw new Error('The chatbot returned an invalid completion receipt.')
  }
  return {
    conversationId: row.conversationId,
    revision: row.revision,
    replayed: row.replayed === true,
  }
}

function parseFrame(frame: string): ChatbotSseEvent | null {
  let event = ''
  const dataLines: string[] = []
  for (const rawLine of frame.split(/\r?\n/)) {
    if (rawLine.startsWith('event:')) {
      event = rawLine.slice('event:'.length).trim()
    } else if (rawLine.startsWith('data:')) {
      dataLines.push(rawLine.slice('data:'.length).trimStart())
    }
  }
  if (!event || dataLines.length === 0) return null
  return { event, data: JSON.parse(dataLines.join('\n')) }
}

/**
 * Decode arbitrary transport chunks into complete SSE events. Neither UTF-8
 * characters nor `\n\n` frame delimiters are guaranteed to align with
 * `reader.read()` boundaries.
 */
export function createChatbotSseParser(
  onEvent: (event: ChatbotSseEvent) => void,
) {
  const decoder = new TextDecoder()
  let buffer = ''
  let finished = false

  const append = (text: string) => {
    buffer += text
  }

  const drain = (flush: boolean) => {
    while (true) {
      const delimiter = buffer.search(/\r?\n\r?\n/)
      if (delimiter < 0) break
      const match = buffer.slice(delimiter).match(/^(?:\r?\n){2}/)
      const delimiterLength = match?.[0].length ?? 2
      const frame = buffer.slice(0, delimiter)
      if (frame.length > MAX_CHATBOT_SSE_BUFFER_CHARACTERS) {
        throw new ChatbotSseFrameTooLargeError()
      }
      buffer = buffer.slice(delimiter + delimiterLength)
      const parsed = parseFrame(frame)
      if (parsed) onEvent(parsed)
    }

    if (flush && buffer.trim()) {
      if (buffer.length > MAX_CHATBOT_SSE_BUFFER_CHARACTERS) {
        throw new ChatbotSseFrameTooLargeError()
      }
      const parsed = parseFrame(buffer)
      buffer = ''
      if (parsed) onEvent(parsed)
    }

    if (buffer.length > MAX_CHATBOT_SSE_BUFFER_CHARACTERS) {
      throw new ChatbotSseFrameTooLargeError()
    }
  }

  return {
    push(chunk: Uint8Array) {
      if (finished) throw new Error('The chatbot SSE parser is already finished.')
      append(decoder.decode(chunk, { stream: true }))
      drain(false)
    },
    finish() {
      if (finished) return
      finished = true
      append(decoder.decode())
      drain(true)
    },
  }
}

type CancelableReader = {
  cancel(reason?: unknown): Promise<void>
}

interface ActiveClientRequest {
  generation: number
  controller: AbortController
  reader: CancelableReader | null
}

export interface ChatbotClientRequest {
  generation: number
  signal: AbortSignal
  idempotencyKey: string
}

const QUERY_LOG_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Own exactly one browser request and fence every stale async continuation. */
export function createChatbotRequestCoordinator() {
  let generation = 0
  let active: ActiveClientRequest | null = null
  let feedbackReceipt: { generation: number; queryLogId: string } | null = null

  const cancelEntry = (entry: ActiveClientRequest, reason: unknown) => {
    if (!entry.controller.signal.aborted) entry.controller.abort(reason)
    if (entry.reader) void entry.reader.cancel(reason).catch(() => undefined)
  }

  return {
    begin(idempotencyKey?: string): ChatbotClientRequest {
      if (active) {
        cancelEntry(
          active,
          new DOMException('Superseded by a newer chatbot request.', 'AbortError'),
        )
      }
      // A new answer can never inherit the prior answer's feedback target.
      feedbackReceipt = null
      generation += 1
      const controller = new AbortController()
      active = { generation, controller, reader: null }
      if (idempotencyKey && !isCurrentChatbotIdempotencyKey(idempotencyKey)) {
        active = null
        throw new Error('Pending chatbot request key is no longer retryable.')
      }
      return {
        generation,
        signal: controller.signal,
        idempotencyKey: idempotencyKey ?? createChatbotIdempotencyKey(),
      }
    },
    attachReader(requestGeneration: number, reader: CancelableReader): boolean {
      if (!active || active.generation !== requestGeneration) {
        void reader.cancel(
          new DOMException('Stale chatbot response.', 'AbortError'),
        ).catch(() => undefined)
        return false
      }
      active.reader = reader
      return true
    },
    isCurrent(requestGeneration: number): boolean {
      return active?.generation === requestGeneration
    },
    acceptFeedbackReceipt(
      requestGeneration: number,
      queryLogId: unknown,
    ): string | null {
      if (
        active?.generation !== requestGeneration ||
        typeof queryLogId !== 'string' ||
        !QUERY_LOG_ID_PATTERN.test(queryLogId)
      ) {
        return null
      }
      feedbackReceipt = { generation: requestGeneration, queryLogId }
      return queryLogId
    },
    invalidateFeedbackReceipt(requestGeneration: number): void {
      if (feedbackReceipt?.generation === requestGeneration) {
        feedbackReceipt = null
      }
    },
    getFeedbackReceipt(requestGeneration: number): string | null {
      return feedbackReceipt?.generation === requestGeneration
        ? feedbackReceipt.queryLogId
        : null
    },
    ownsFeedbackReceipt(queryLogId: string): boolean {
      return feedbackReceipt?.queryLogId === queryLogId
    },
    finish(requestGeneration: number): void {
      if (active?.generation === requestGeneration) active = null
    },
    cancelCurrent(reason: unknown = new DOMException(
      'Chatbot view was closed.',
      'AbortError',
    )): void {
      feedbackReceipt = null
      if (!active) return
      const entry = active
      active = null
      cancelEntry(entry, reason)
    },
  }
}
