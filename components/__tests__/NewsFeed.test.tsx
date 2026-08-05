import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import NewsFeed from '@/components/NewsFeed'
import type { NewsItem } from '@/app/actions/get-stock-news'

function story(index: number, overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    title: `Company story ${index}`,
    text: '',
    url: `https://news.example.com/story-${index}`,
    image: null,
    publishedDate: `2026-08-03T${String(10 + index).padStart(2, '0')}:00:00Z`,
    site: 'Example News',
    symbol: 'AAPL',
    ...overrides,
  }
}

describe('NewsFeed', () => {
  it('shows a concise initial feed with the rest behind disclosure', () => {
    render(<NewsFeed news={Array.from({ length: 10 }, (_, index) => story(index))} />)

    expect(screen.getByRole('heading', { name: 'Latest news' })).toBeInTheDocument()
    expect(screen.getByText('10 stories')).toBeInTheDocument()
    expect(screen.getByText('Show 2 more stories')).toBeInTheDocument()
  })

  it('drops duplicate and unsafe provider links', () => {
    render(
      <NewsFeed
        news={[
          story(1),
          story(1),
          story(2, { url: 'javascript:alert(1)' }),
        ]}
      />,
    )

    expect(screen.getByText('1 story')).toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })
})
