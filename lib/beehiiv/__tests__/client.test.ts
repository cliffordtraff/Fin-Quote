import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { describe, expect, it, vi } from 'vitest'
import { __testOnly } from '../client'

describe('Beehiiv post state parsing', () => {
  it('parses lifecycle state without assuming get_post returns stats', () => {
    expect(
      __testOnly.parseBeehiivPostState(
        {
          structuredContent: {
            data: {
              id: 'post_00000000-0000-0000-0000-000000000000',
              status: 'confirmed',
              publish_date: '2026-08-06T12:42:00Z',
              web_url: 'https://newsletter.example/post',
            },
          },
        },
        'post_00000000-0000-0000-0000-000000000000',
      ),
    ).toEqual({
      postId: 'post_00000000-0000-0000-0000-000000000000',
      status: 'confirmed',
      publishDate: '2026-08-06T12:42:00Z',
      webUrl: 'https://newsletter.example/post',
      stats: null,
    })
  })

  it('extracts email and web statistics from get_post_stats', () => {
    const stats = __testOnly.parseBeehiivPostStats(
      {
        structuredContent: {
          data: {
            email: {
              recipients: 1,
              delivered: 1,
              opens: 2,
              unique_opens: 1,
              open_rate: 1,
              clicks: 0,
              unique_clicks: 0,
              click_rate: 0,
              unsubscribes: 0,
              spam_reports: 0,
            },
            web: { views: 2, clicks: 0 },
          },
        },
      },
    )

    expect(stats).toEqual({
      email: {
        recipients: 1,
        delivered: 1,
        opens: 2,
        unique_opens: 1,
        open_rate: 1,
        clicks: 0,
        unique_clicks: 0,
        click_rate: 0,
        unsubscribes: 0,
        spam_reports: 0,
      },
      web: { views: 2, clicks: 0 },
    })
  })

  it('uses the dedicated stats tool with only post_id', async () => {
    const callTool = vi
      .fn()
      .mockResolvedValueOnce({
        structuredContent: {
          data: {
            id: 'post_00000000-0000-0000-0000-000000000000',
            status: 'published',
          },
        },
      })
      .mockResolvedValueOnce({
        structuredContent: {
          data: {
            email: { recipients: 10, delivered: 9 },
            web: { views: 4, clicks: 1 },
          },
        },
      })

    const state = await __testOnly.loadBeehiivPostState(
      { callTool } as unknown as Client,
      'pub_00000000-0000-0000-0000-000000000000',
      'post_00000000-0000-0000-0000-000000000000',
    )

    expect(callTool.mock.calls[1]?.[0]).toEqual({
      name: 'get_post_stats',
      arguments: {
        post_id: 'post_00000000-0000-0000-0000-000000000000',
      },
    })
    expect(callTool.mock.calls[1]?.[2]).toMatchObject({
      timeout: 8_000,
      maxTotalTimeout: 8_000,
    })
    expect(state.stats).toEqual({
      email: { recipients: 10, delivered: 9 },
      web: { views: 4, clicks: 1 },
    })
  })

  it('keeps lifecycle reconciliation usable when stats fail', async () => {
    const callTool = vi
      .fn()
      .mockResolvedValueOnce({
        structuredContent: {
          data: {
            id: 'post_00000000-0000-0000-0000-000000000000',
            status: 'scheduled',
            publish_date: '2026-08-07T12:00:00Z',
          },
        },
      })
      .mockResolvedValueOnce({
        isError: true,
        content: [{ type: 'text', text: 'Stats are still calculating' }],
      })

    await expect(
      __testOnly.loadBeehiivPostState(
        { callTool } as unknown as Client,
        'pub_00000000-0000-0000-0000-000000000000',
        'post_00000000-0000-0000-0000-000000000000',
      ),
    ).resolves.toMatchObject({ status: 'scheduled', stats: null })
  })
})
