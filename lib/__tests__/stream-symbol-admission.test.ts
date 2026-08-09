import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getSymbolValidity: vi.fn() }))

vi.mock('@/lib/symbol-resolver', () => ({
  getSymbolValidity: mocks.getSymbolValidity,
}))

import { admitPublicStreamSymbols } from '@/lib/stream-symbol-admission'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('public stream symbol admission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSymbolValidity.mockResolvedValue('valid')
  })

  it('normalizes and deduplicates stocks while preserving exact futures', async () => {
    await expect(admitPublicStreamSymbols([
      'brk-b',
      'BRK.B',
      'es=f',
    ])).resolves.toEqual({
      kind: 'admitted',
      symbols: ['BRK.B', 'ES=F'],
    })
    expect(mocks.getSymbolValidity).toHaveBeenCalledTimes(1)
    expect(mocks.getSymbolValidity).toHaveBeenCalledWith('BRK.B')
  })

  it('finishes all cheap validation before starting stock registry work', async () => {
    await expect(admitPublicStreamSymbols(['AAPL', 'ZZZ=F'])).resolves.toEqual({
      kind: 'invalid',
      symbol: 'ZZZ=F',
    })
    expect(mocks.getSymbolValidity).not.toHaveBeenCalled()
  })

  it('fails the whole set closed when any stock validation is unavailable', async () => {
    mocks.getSymbolValidity.mockImplementation(async (symbol: string) =>
      symbol === 'MSFT' ? 'unavailable' : 'not_found'
    )

    await expect(admitPublicStreamSymbols(['AAPL', 'MSFT'])).resolves.toEqual({
      kind: 'unavailable',
      symbol: 'MSFT',
    })
  })

  it('rejects with the exact caller abort reason without cancelling shared work', async () => {
    const validation = deferred<'valid'>()
    const controller = new AbortController()
    const reason = new DOMException('caller left', 'AbortError')
    mocks.getSymbolValidity.mockReturnValue(validation.promise)

    const admission = admitPublicStreamSymbols(['AAPL'], controller.signal)
    await vi.waitFor(() => {
      expect(mocks.getSymbolValidity).toHaveBeenCalledTimes(1)
    })
    controller.abort(reason)

    await expect(admission).rejects.toBe(reason)
    validation.resolve('valid')
  })
})
