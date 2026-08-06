import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import ConceptChartPage from '@/app/concept/page'

vi.mock('@/components/Navigation', () => ({
  default: () => <nav>Navigation</nav>,
}))

describe('ConceptChartPage server render', () => {
  it('renders an explicit unavailable state without generating placeholder data', () => {
    const randomSpy = vi.spyOn(Math, 'random')

    const firstHtml = renderToStaticMarkup(<ConceptChartPage />)
    const secondHtml = renderToStaticMarkup(<ConceptChartPage />)

    expect(randomSpy).not.toHaveBeenCalled()
    expect(firstHtml).toBe(secondHtml)
    expect(firstHtml).toContain('Historical market breadth is temporarily unavailable')
    expect(firstHtml).toContain('We removed the placeholder history from this page.')
    expect(firstHtml).toContain('href="/dashboard/pulse-today"')
    expect(firstHtml).not.toContain('Loading advance-decline data...')
  })
})
