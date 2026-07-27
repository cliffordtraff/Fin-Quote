import { describe, expect, it } from 'vitest'
import {
  isBlockedCrawlerUserAgent,
  isStaticOrMetadataPath,
} from '@/lib/request-policy'

describe('request policy', () => {
  it('serves metadata and static files without ticker redirects', () => {
    expect(isStaticOrMetadataPath('/robots.txt')).toBe(true)
    expect(isStaticOrMetadataPath('/sitemap.xml')).toBe(true)
    expect(isStaticOrMetadataPath('/manifest.webmanifest')).toBe(true)
    expect(isStaticOrMetadataPath('/_next/static/app.js')).toBe(true)
    expect(isStaticOrMetadataPath('/stock/AAPL')).toBe(false)
  })

  it('blocks the observed Bytespider crawler without blocking browsers or Google', () => {
    expect(
      isBlockedCrawlerUserAgent(
        'Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)'
      )
    ).toBe(true)
    expect(isBlockedCrawlerUserAgent('Mozilla/5.0 Chrome/140.0')).toBe(false)
    expect(isBlockedCrawlerUserAgent('Googlebot/2.1')).toBe(false)
    expect(isBlockedCrawlerUserAgent(null)).toBe(false)
  })
})
