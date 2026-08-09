import { describe, expect, it, vi } from 'vitest'
import {
  MAX_CHATBOT_SSE_BUFFER_CHARACTERS,
  ChatbotSseFrameTooLargeError,
  createChatbotRequestCoordinator,
  createChatbotSseParser,
  parseChatbotCompletionReceipt,
} from '@/lib/chatbot/client-stream'
import {
  createChatbotIdempotencyKey,
  isCurrentChatbotIdempotencyKey,
} from '@/lib/chatbot/idempotency-key'

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('chatbot SSE parser', () => {
  it('handles a UTF-8 event split across chunks and multiple coalesced events', () => {
    const events: Array<{ event: string; data: unknown }> = []
    const parser = createChatbotSseParser(event => events.push(event))
    const bytes = new TextEncoder().encode(
      'event: answer\ndata: {"content":"Revenue 📈"}\n\n' +
      'event: followup\ndata: {"questions":["Why?"]}\n\n' +
      'event: complete\ndata: {"queryLogId":"log-1"}\n\n',
    )
    const emoji = bytes.findIndex((value, index) =>
      value === 0xf0 && bytes[index + 1] === 0x9f,
    )

    parser.push(bytes.slice(0, emoji + 2))
    parser.push(bytes.slice(emoji + 2, emoji + 9))
    parser.push(bytes.slice(emoji + 9))
    parser.finish()

    expect(events).toEqual([
      { event: 'answer', data: { content: 'Revenue 📈' } },
      { event: 'followup', data: { questions: ['Why?'] } },
      { event: 'complete', data: { queryLogId: 'log-1' } },
    ])
  })

  it('flushes one complete trailing frame without a final blank line', () => {
    const events: Array<{ event: string; data: unknown }> = []
    const parser = createChatbotSseParser(event => events.push(event))

    parser.push(new TextEncoder().encode('event: answer\ndata: {"content":"done"}'))
    parser.finish()

    expect(events).toEqual([{ event: 'answer', data: { content: 'done' } }])
  })

  it('fails closed on an oversized unterminated frame', () => {
    const parser = createChatbotSseParser(() => undefined)

    expect(() => parser.push(new Uint8Array(
      MAX_CHATBOT_SSE_BUFFER_CHARACTERS + 1,
    ).fill(65))).toThrow(ChatbotSseFrameTooLargeError)
  })
})

describe('chatbot completion receipt', () => {
  it('accepts only a durable conversation pointer', () => {
    expect(parseChatbotCompletionReceipt({
      conversationId: '00000000-0000-4000-8000-000000000001',
      revision: 2,
      replayed: true,
      latency: { ignored: true },
    })).toEqual({
      conversationId: '00000000-0000-4000-8000-000000000001',
      revision: 2,
      replayed: true,
    })
    expect(() => parseChatbotCompletionReceipt({
      conversationId: 'not-a-uuid',
      revision: 2,
    })).toThrow()
    expect(() => parseChatbotCompletionReceipt({
      conversationId: '00000000-0000-4000-8000-000000000001',
      revision: null,
    })).toThrow()
  })
})

describe('chatbot client request coordinator', () => {
  const FIRST_QUERY_LOG_ID = 'ea9b0a63-c765-4e17-b839-7c9bb7e8d7c7'

  it('issues a current versioned idempotency key for every request', () => {
    const coordinator = createChatbotRequestCoordinator()
    const request = coordinator.begin()

    expect(request.idempotencyKey).toMatch(/^c1\.\d{13}\./)
    expect(isCurrentChatbotIdempotencyKey(request.idempotencyKey)).toBe(true)
  })

  it('reuses an explicitly retained current key for an uncertain retry', () => {
    const coordinator = createChatbotRequestCoordinator()
    const retainedKey = createChatbotIdempotencyKey()
    const request = coordinator.begin(retainedKey)

    expect(request.idempotencyKey).toBe(retainedKey)
    expect(() => coordinator.begin('legacy-key')).toThrow(
      'Pending chatbot request key is no longer retryable.',
    )
  })

  it('aborts and cancels an old request and fences its abort-ignoring result', async () => {
    const coordinator = createChatbotRequestCoordinator()
    const old = coordinator.begin()
    const oldReader = { cancel: vi.fn().mockResolvedValue(undefined) }
    coordinator.attachReader(old.generation, oldReader)
    const staleResult = deferred<string>()
    const committed: string[] = []
    const staleContinuation = staleResult.promise.then(value => {
      if (coordinator.isCurrent(old.generation)) committed.push(value)
    })

    const current = coordinator.begin()
    staleResult.resolve('stale answer')
    await staleContinuation

    expect(old.signal.aborted).toBe(true)
    expect(oldReader.cancel).toHaveBeenCalledOnce()
    expect(coordinator.isCurrent(old.generation)).toBe(false)
    expect(coordinator.isCurrent(current.generation)).toBe(true)
    expect(committed).toEqual([])
  })

  it('aborts and cancels the active reader on unmount cleanup', () => {
    const coordinator = createChatbotRequestCoordinator()
    const request = coordinator.begin()
    const reader = { cancel: vi.fn().mockResolvedValue(undefined) }
    coordinator.attachReader(request.generation, reader)

    coordinator.cancelCurrent()

    expect(request.signal.aborted).toBe(true)
    expect(reader.cancel).toHaveBeenCalledOnce()
    expect(coordinator.isCurrent(request.generation)).toBe(false)
  })

  it('cannot expose the prior receipt after a partial next answer fails', () => {
    const coordinator = createChatbotRequestCoordinator()
    const first = coordinator.begin()
    expect(coordinator.acceptFeedbackReceipt(
      first.generation,
      FIRST_QUERY_LOG_ID,
    )).toBe(FIRST_QUERY_LOG_ID)
    coordinator.finish(first.generation)
    expect(coordinator.getFeedbackReceipt(first.generation)).toBe(FIRST_QUERY_LOG_ID)

    const second = coordinator.begin()
    expect(coordinator.ownsFeedbackReceipt(FIRST_QUERY_LOG_ID)).toBe(false)
    let partialAnswer = ''
    const parser = createChatbotSseParser(({ event, data }) => {
      const payload = data as Record<string, unknown>
      if (event === 'answer' && typeof payload.content === 'string') {
        partialAnswer += payload.content
      }
      if (event === 'error') {
        coordinator.invalidateFeedbackReceipt(second.generation)
      }
    })
    parser.push(new TextEncoder().encode(
      'event: answer\ndata: {"content":"partial B"}\n\n' +
      'event: error\ndata: {"message":"stream failed"}\n\n',
    ))
    parser.finish()
    coordinator.finish(second.generation)

    expect(partialAnswer).toBe('partial B')
    expect(coordinator.getFeedbackReceipt(first.generation)).toBeNull()
    expect(coordinator.getFeedbackReceipt(second.generation)).toBeNull()
  })

  it('accepts feedback receipts only for the active generation and valid UUIDs', () => {
    const coordinator = createChatbotRequestCoordinator()
    const first = coordinator.begin()
    const second = coordinator.begin()

    expect(coordinator.acceptFeedbackReceipt(
      first.generation,
      FIRST_QUERY_LOG_ID,
    )).toBeNull()
    expect(coordinator.acceptFeedbackReceipt(second.generation, 'old-log')).toBeNull()
    expect(coordinator.getFeedbackReceipt(second.generation)).toBeNull()
  })
})
