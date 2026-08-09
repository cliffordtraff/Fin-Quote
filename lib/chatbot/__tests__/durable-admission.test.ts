import { describe, expect, it } from 'vitest'
import {
  parseDurableAdmissionRpcRow,
  parseDurableFailureRpcValue,
  parseDurableResolutionRpcRow,
} from '@/lib/chatbot/durable-admission'

const TOKEN = '00000000-0000-4000-8000-000000000001'

describe('durable chatbot admission RPC decoding', () => {
  it('accepts only a fenced acquired row', () => {
    expect(parseDurableAdmissionRpcRow({
      disposition: 'acquired',
      lease_token: TOKEN,
      retry_after_seconds: 180,
      result_conversation_id: null,
      result_revision: null,
    })).toEqual({
      disposition: 'acquired',
      leaseToken: TOKEN,
      retryAfterSeconds: 180,
      conversationId: null,
      revision: null,
    })
  })

  it('accepts a completed content-free conversation pointer', () => {
    expect(parseDurableAdmissionRpcRow({
      disposition: 'completed',
      lease_token: null,
      retry_after_seconds: 0,
      result_conversation_id: TOKEN,
      result_revision: 7,
    })).toEqual({
      disposition: 'completed',
      leaseToken: null,
      retryAfterSeconds: 0,
      conversationId: TOKEN,
      revision: 7,
    })
  })

  it('accepts a terminal physical-attempt fuse without a token', () => {
    expect(parseDurableAdmissionRpcRow({
      disposition: 'attempts_exhausted',
      lease_token: null,
      retry_after_seconds: 0,
      result_conversation_id: null,
      result_revision: null,
    }).disposition).toBe('attempts_exhausted')
  })

  it.each([
    {
      disposition: 'unknown',
      lease_token: null,
      retry_after_seconds: 0,
      result_conversation_id: null,
      result_revision: null,
    },
    {
      disposition: 'acquired',
      lease_token: null,
      retry_after_seconds: 180,
      result_conversation_id: null,
      result_revision: null,
    },
    {
      disposition: 'rate_limited',
      lease_token: TOKEN,
      retry_after_seconds: 30,
      result_conversation_id: null,
      result_revision: null,
    },
    {
      disposition: 'acquired',
      lease_token: 'not-a-uuid',
      retry_after_seconds: 180,
      result_conversation_id: null,
      result_revision: null,
    },
    {
      disposition: 'rate_limited',
      lease_token: null,
      retry_after_seconds: Number.MAX_SAFE_INTEGER + 1,
      result_conversation_id: null,
      result_revision: null,
    },
    {
      disposition: 'rate_limited',
      lease_token: null,
      retry_after_seconds: 181,
      result_conversation_id: null,
      result_revision: null,
    },
    {
      disposition: 'completed',
      lease_token: null,
      retry_after_seconds: 0,
      result_conversation_id: null,
      result_revision: null,
    },
    {
      disposition: 'failed',
      lease_token: null,
      retry_after_seconds: 0,
      result_conversation_id: TOKEN,
      result_revision: 1,
    },
    {
      disposition: 'failed',
      lease_token: null,
      retry_after_seconds: 0,
      result_conversation_id: TOKEN,
      result_revision: null,
    },
  ])('rejects a malformed acquire result %#', row => {
    expect(() => parseDurableAdmissionRpcRow(row)).toThrow()
  })

  it('accepts only exact failure settlement enums', () => {
    expect(parseDurableFailureRpcValue('failed')).toBe('failed')
    expect(parseDurableFailureRpcValue('fence_lost')).toBe('fence_lost')
    expect(() => parseDurableFailureRpcValue('completed')).toThrow()
    expect(() => parseDurableFailureRpcValue('ok')).toThrow()
    expect(() => parseDurableFailureRpcValue(null)).toThrow()
  })

  it('requires an exact pointer only for completed ambiguity resolution', () => {
    expect(parseDurableResolutionRpcRow({
      disposition: 'completed',
      result_conversation_id: TOKEN,
      result_revision: 3,
    })).toEqual({
      disposition: 'completed',
      conversationId: TOKEN,
      revision: 3,
    })
    expect(parseDurableResolutionRpcRow({
      disposition: 'in_progress',
      result_conversation_id: null,
      result_revision: null,
    }).disposition).toBe('in_progress')
    expect(parseDurableResolutionRpcRow({
      disposition: 'expired',
      result_conversation_id: null,
      result_revision: null,
    }).disposition).toBe('expired')
    expect(() => parseDurableResolutionRpcRow({
      disposition: 'completed',
      result_conversation_id: null,
      result_revision: null,
    })).toThrow()
    expect(() => parseDurableResolutionRpcRow({
      disposition: 'completed',
      result_conversation_id: TOKEN,
      result_revision: null,
    })).toThrow()
    expect(() => parseDurableResolutionRpcRow({
      disposition: 'in_progress',
      result_conversation_id: TOKEN,
      result_revision: null,
    })).toThrow()
  })
})
