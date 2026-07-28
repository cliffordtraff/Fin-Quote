import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import ConceptChartPage from '@/app/concept/page'

vi.mock('@/components/Navigation', () => ({
  default: () => <nav>Navigation</nav>,
}))

vi.mock('@/app/actions/mag7-returns', () => ({
  getMag7Returns: vi.fn(),
}))

vi.mock('@/app/actions/sp500-distribution', () => ({
  getSP500Distribution: vi.fn(),
}))

vi.mock('@/app/actions/advance-decline', () => ({
  getAdvanceDeclineSnapshot: vi.fn(),
}))

vi.mock('@/app/actions/nyse-advance-decline', () => ({
  getNYSEAdvanceDeclineSnapshot: vi.fn(),
}))

describe('ConceptChartPage server render', () => {
  it('renders a deterministic loading shell without generating placeholder candles', () => {
    const randomSpy = vi.spyOn(Math, 'random')

    const firstHtml = renderToStaticMarkup(<ConceptChartPage />)
    const secondHtml = renderToStaticMarkup(<ConceptChartPage />)

    expect(randomSpy).not.toHaveBeenCalled()
    expect(firstHtml).toBe(secondHtml)
    expect(firstHtml).toContain('Loading advance-decline data...')
    expect(firstHtml).toContain('Loading NYSE advance-decline data...')
    expect(firstHtml).not.toContain('Advances:')
    expect(firstHtml).not.toContain('Declines:')
  })
})
