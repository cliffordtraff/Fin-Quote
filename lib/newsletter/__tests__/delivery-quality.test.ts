import { describe, expect, it } from 'vitest'
import {
  assertNewsletterHtmlSize,
  hasUnsafeNewsletterControlCharacters,
  isSafeNewsletterLink,
  normalizeNewsletterPreviewText,
  normalizeNewsletterSubject,
  NEWSLETTER_HTML_MAX_BYTES,
} from '../delivery-quality'

describe('newsletter delivery quality', () => {
  it('normalizes long subjects without inbox-truncation dots', () => {
    const subject = normalizeNewsletterSubject(
      'PODD down 20.1%: Insulet cuts 2026 revenue growth guidance to 20%-22% and assumes mid-teens 2027 revenue exit rate',
    )
    expect(subject.length).toBeLessThanOrEqual(60)
    expect(subject).toBe(
      'PODD down 20.1%: Insulet cuts 2026 revenue growth guidance',
    )
  })

  it('removes control characters and literal ellipses from subjects', () => {
    const subject = normalizeNewsletterSubject(
      'NVDA gains...\r\non stronger orders…\u0085into year-end',
    )

    expect(subject).toBe('NVDA gains on stronger orders into year-end')
    expect(subject).not.toMatch(/\.{3}|…/)
    expect(hasUnsafeNewsletterControlCharacters(subject)).toBe(false)
  })

  it('prefers a complete clause over an awkward final word fragment', () => {
    expect(
      normalizeNewsletterSubject(
        'MCK up 5.9%: McKesson beats Q1 2027 estimates with EPS $9.93, revenue $105.4B and stronger guidance',
      ),
    ).toBe('MCK up 5.9%: McKesson beats Q1 2027 estimates with EPS $9.93')
  })

  it('compacts common earnings boilerplate before truncating', () => {
    expect(
      normalizeNewsletterSubject(
        'UBER down 5.3%: UBER Q2 adjusted EBITDA $2.8B tops expectations as delivery demand accelerates',
      ),
    ).toBe('UBER down 5.3%: Q2 adjusted EBITDA $2.8B beats estimates')
    expect(
      normalizeNewsletterSubject(
        'MCHP down 3.6%: Microchip Technology Inc is scheduled to announce earnings today after market close',
      ),
    ).toBe('MCHP down 3.6%: Microchip Technology reports after the close')
    expect(
      normalizeNewsletterSubject(
        'DIS up 3.6%: Walt Disney Q3 2026 EPS beats, revenue misses as streaming improves',
      ),
    ).toBe('DIS up 3.6%: Walt Disney Q3 2026 EPS beats estimates')
    expect(
      normalizeNewsletterSubject(
        'NWSA up 1.6%: News Corp reports fiscal Q4 2026 results',
      ),
    ).toBe('NWSA up 1.6%: News Corp reports fiscal Q4 2026 results')
  })

  it('never splits Unicode graphemes at the subject boundary', () => {
    const subject = normalizeNewsletterSubject(`${'A'.repeat(59)}😀 update`)

    expect(subject.length).toBeLessThanOrEqual(60)
    expect(subject).not.toMatch(/[\uD800-\uDFFF]$/)
    expect(() => new TextEncoder().encode(subject)).not.toThrow()
  })

  it('caps and flattens generated inbox preview text', () => {
    const preview = normalizeNewsletterPreviewText(
      `Market\r\nupdate\u0000 ${'with durable demand '.repeat(12)}`,
    )

    expect(preview.length).toBeLessThanOrEqual(120)
    expect(hasUnsafeNewsletterControlCharacters(preview)).toBe(false)
    expect(preview).toBe(preview.trim())
  })

  it('allows only credential-free HTTPS links', () => {
    expect(isSafeNewsletterLink('https://example.com/story')).toBe(true)
    expect(isSafeNewsletterLink('javascript:alert(1)')).toBe(false)
    expect(isSafeNewsletterLink('http://example.com/story')).toBe(false)
    expect(isSafeNewsletterLink('https://user:pass@example.com')).toBe(false)
  })

  it('blocks HTML large enough to risk inbox clipping', () => {
    expect(() =>
      assertNewsletterHtmlSize('x'.repeat(NEWSLETTER_HTML_MAX_BYTES + 1)),
    ).toThrow('reduce it below')
  })
})
