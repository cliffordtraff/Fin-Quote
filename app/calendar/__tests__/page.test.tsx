import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getGlobalIndexQuotes: vi.fn(),
  getFuturesQuotes: vi.fn(),
  getEarnings: vi.fn(),
  getEconomic: vi.fn(),
}))

vi.mock('@/app/actions/global-indices', () => ({
  getGlobalIndexQuotes: mocks.getGlobalIndexQuotes,
  getFuturesQuotes: mocks.getFuturesQuotes,
}))

vi.mock('@/app/actions/earnings-calendar', () => ({
  fetchEarningsCalendarForCatalystCalendar: mocks.getEarnings,
}))

vi.mock('@/app/actions/economic-calendar', () => ({
  getEconomicEventsForCatalystCalendar: mocks.getEconomic,
}))

vi.mock('@/components/AppShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}))

vi.mock('@/components/CatalystCalendar', () => ({
  default: ({ model }: { model: { items: unknown[]; feeds: { economic: { status: string }; earnings: { status: string } } } }) => (
    <div data-testid="catalyst-model">
      {model.feeds.economic.status}:{model.feeds.earnings.status}:{model.items.length}
    </div>
  ),
}))

vi.mock('@/components/MarketSessions', () => ({
  default: ({ indexQuotes, futuresQuotes }: { indexQuotes: unknown[]; futuresQuotes: unknown[] }) => (
    <div data-testid="market-sessions">{indexQuotes.length}:{futuresQuotes.length}</div>
  ),
}))

import CalendarPage from '@/app/calendar/page'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('CalendarPage', () => {
  it('starts all four reads concurrently and retains partial catalyst results above Market Sessions', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-03T14:00:00Z'))

    const indices = deferred<unknown[]>()
    const futures = deferred<unknown[]>()
    const earnings = deferred<{
      earnings: Array<{
        symbol: string
        name: string
        date: string
        time: 'bmo'
        fiscalDateEnding: string
        eps: null
        epsEstimated: null
        revenue: null
        revenueEstimated: null
      }>
      totalCount: number
      truncated: boolean
    }>()
    const economic = deferred<{ error: string }>()

    mocks.getGlobalIndexQuotes.mockReturnValue(indices.promise)
    mocks.getFuturesQuotes.mockReturnValue(futures.promise)
    mocks.getEarnings.mockReturnValue(earnings.promise)
    mocks.getEconomic.mockReturnValue(economic.promise)

    const pagePromise = CalendarPage()

    expect(mocks.getGlobalIndexQuotes).toHaveBeenCalledOnce()
    expect(mocks.getFuturesQuotes).toHaveBeenCalledOnce()
    expect(mocks.getEarnings).toHaveBeenCalledOnce()
    expect(mocks.getEconomic).toHaveBeenCalledOnce()
    expect(mocks.getEarnings).toHaveBeenCalledWith('2026-08-03T14:00:00.000Z')
    expect(mocks.getEconomic).toHaveBeenCalledWith('2026-08-03T14:00:00.000Z')

    indices.resolve([{ market: 'New York' }])
    futures.resolve([{ symbol: 'ES' }])
    earnings.resolve({
      earnings: [{
        symbol: 'AAPL',
        name: 'Apple Inc.',
        date: '2026-08-04',
        time: 'bmo',
        fiscalDateEnding: '2026-06-30',
        eps: null,
        epsEstimated: null,
        revenue: null,
        revenueEstimated: null,
      }],
      totalCount: 1,
      truncated: false,
    })
    economic.resolve({ error: 'unavailable' })

    render(await pagePromise)

    expect(screen.getByTestId('catalyst-model')).toHaveTextContent('unavailable:ready:1')
    expect(screen.getByTestId('market-sessions')).toHaveTextContent('1:1')
    expect(screen.getByRole('heading', { name: 'International Sessions' })).toBeInTheDocument()
  })
})
