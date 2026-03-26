import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EmbedChart from '@/components/EmbedChart'

function expectedHostOrigin() {
  try {
    const origin = new URL(window.location.href).origin
    return origin === 'null' ? 'https://theintraday.com' : origin
  } catch {
    return 'https://theintraday.com'
  }
}

describe('EmbedChart', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_CHARTING_URL = 'http://localhost:3001'
    document.documentElement.classList.remove('dark')
    vi.stubGlobal('MutationObserver', class {
      observe() {}
      disconnect() {}
      takeRecords() { return [] }
    })
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_CHARTING_URL
    vi.unstubAllGlobals()
  })

  it('uses the configured charting URL and current host origin', () => {
    render(<EmbedChart symbol="AAPL" />)

    expect(screen.getByTitle('AAPL price chart')).toHaveAttribute(
      'src',
      `http://localhost:3001/embed?symbol=AAPL&tf=D&range=1y&theme=light&toolbar=simplified&origin=${encodeURIComponent(expectedHostOrigin())}`
    )
  })

  it('tracks dark mode in the embed iframe src', () => {
    document.documentElement.classList.add('dark')

    render(<EmbedChart symbol="MSFT" />)

    expect(screen.getByTitle('MSFT price chart')).toHaveAttribute(
      'src',
      `http://localhost:3001/embed?symbol=MSFT&tf=D&range=1y&theme=dark&toolbar=simplified&origin=${encodeURIComponent(expectedHostOrigin())}`
    )
  })
})
