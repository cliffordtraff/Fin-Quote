import { describe, expect, it } from 'vitest'
import { withAbortTimeout } from '../daily-summaries'

describe('daily summary cancellation', () => {
  it('aborts the underlying worker when its time budget expires', async () => {
    let observedAbort = false
    await expect(() =>
      withAbortTimeout(
        (signal) =>
          new Promise<void>((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                observedAbort = true
                reject(signal.reason)
              },
              { once: true },
            )
          }),
        10,
        'AAPL',
      ),
    ).rejects.toThrow('AAPL timed out after 10ms')
    expect(observedAbort).toBe(true)
  })

  it('returns on deadline even when a provider ignores cancellation', async () => {
    await expect(() =>
      withAbortTimeout(
        () => new Promise<never>(() => undefined),
        10,
        'MSFT',
      ),
    ).rejects.toThrow('MSFT timed out after 10ms')
  })
})
