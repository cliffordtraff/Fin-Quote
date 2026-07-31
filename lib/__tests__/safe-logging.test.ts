import { describe, expect, it } from 'vitest'
import { redactSensitiveText, safeErrorMessage } from '@/lib/safe-logging'

describe('safe logging', () => {
  it('redacts credential query parameters without removing useful context', () => {
    const value =
      'Request failed: https://example.com/quote/AAPL?apikey=secret-value&from=2026-01-01'

    expect(redactSensitiveText(value)).toBe(
      'Request failed: https://example.com/quote/AAPL?apikey=[REDACTED]&from=2026-01-01',
    )
  })

  it('redacts authorization headers and environment-style secrets', () => {
    expect(
      redactSensitiveText(
        'Authorization: Bearer token-value, FMP_API_KEY=another-secret',
      ),
    ).toBe(
      'Authorization: Bearer [REDACTED], FMP_API_KEY=[REDACTED]',
    )
  })

  it('logs only a sanitized error message instead of the error object', () => {
    const error = new Error(
      'fetch https://example.com/data?api_key=private-token failed',
    )

    expect(safeErrorMessage(error)).toBe(
      'fetch https://example.com/data?api_key=[REDACTED] failed',
    )
  })
})
