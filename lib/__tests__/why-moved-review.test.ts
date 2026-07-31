import { randomUUID } from 'crypto'
import { readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { resolve } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import type { AllSessionMoversResult } from '@/app/actions/market-movers'
import {
  buildWhyMovedReviewKey,
  saveWhyMovedReview,
  selectWhyMovedCandidates,
} from '@/lib/why-moved-review'
import type { WhyMovedCandidate } from '@/lib/why-moved-types'

const localReviewDir = resolve(
  tmpdir(),
  `fin-quote-why-moved-${randomUUID()}`,
)
const localReviewPath = resolve(localReviewDir, 'reviews.json')
const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

afterEach(() => {
  rmSync(localReviewDir, { recursive: true, force: true })

  if (originalSupabaseUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl
  }

  if (originalServiceRoleKey === undefined) {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  } else {
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey
  }
})

function buildMovers(
  symbols: string[],
  direction: 'gainer' | 'loser',
): AllSessionMoversResult {
  const movers = symbols.map((symbol, index) => ({
    symbol,
    name: `${symbol} Inc.`,
    price: 20 + index,
    change: direction === 'gainer' ? 1 + index : -1 - index,
    changesPercentage:
      direction === 'gainer' ? 5 + index : -5 - index,
  }))

  return {
    premarket: [],
    cash: movers,
    afterhours: [],
    currentSession: 'cash',
  }
}

describe('selectWhyMovedCandidates', () => {
  it('prioritizes active-session gainers and losers with stable review keys', () => {
    const candidates = selectWhyMovedCandidates(
      buildMovers(['AAA', 'BBB'], 'gainer'),
      buildMovers(['CCC', 'DDD'], 'loser'),
      '2026-07-28',
    )

    expect(candidates.map((candidate) => candidate.symbol)).toEqual([
      'AAA',
      'BBB',
      'CCC',
      'DDD',
    ])
    expect(candidates[0]).toMatchObject({
      direction: 'gainer',
      session: 'cash',
      marketDate: '2026-07-28',
      reviewKey: '2026-07-28:cash:gainer:AAA',
    })
    expect(candidates[2]).toMatchObject({
      direction: 'loser',
      reviewKey: '2026-07-28:cash:loser:CCC',
    })
  })

  it('deduplicates symbols that appear on both sides of the mover feed', () => {
    const candidates = selectWhyMovedCandidates(
      buildMovers(['SHARED', 'UP'], 'gainer'),
      buildMovers(['SHARED', 'DOWN'], 'loser'),
      '2026-07-28',
    )

    expect(candidates.map((candidate) => candidate.symbol)).toEqual([
      'SHARED',
      'UP',
      'DOWN',
    ])
  })

  it('keeps closing snapshots on the regular-session review key', () => {
    const gainers = {
      ...buildMovers(['AAA'], 'gainer'),
      currentSession: 'closed' as const,
    }
    const losers = {
      ...buildMovers(['BBB'], 'loser'),
      currentSession: 'closed' as const,
    }

    const candidates = selectWhyMovedCandidates(
      gainers,
      losers,
      '2026-07-28',
    )

    expect(candidates[0]).toMatchObject({
      session: 'cash',
      reviewKey: '2026-07-28:cash:gainer:AAA',
    })
  })

  it('normalizes symbols when building review keys', () => {
    expect(
      buildWhyMovedReviewKey({
        marketDate: '2026-07-28',
        session: 'cash',
        direction: 'gainer',
        symbol: ' aapl ',
      }),
    ).toBe('2026-07-28:cash:gainer:AAPL')
  })

  it('persists and updates local review state by canonical key', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY

    const candidate: WhyMovedCandidate = {
      reviewKey: '2026-07-28:cash:gainer:AAPL',
      symbol: 'aapl',
      name: 'Apple Inc.',
      price: 215,
      change: 5,
      changesPercentage: 2.38,
      direction: 'gainer',
      session: 'cash',
      marketDate: '2026-07-28',
    }

    const approved = await saveWhyMovedReview({
      candidate,
      status: 'approved',
      notes: 'Confirmed against the company release.',
      reviewerId: 'reviewer-1',
    }, { localStoragePath: localReviewPath })
    const revised = await saveWhyMovedReview({
      candidate,
      status: 'needs_work',
      notes: 'Add timing context.',
      reviewerId: 'reviewer-1',
    }, { localStoragePath: localReviewPath })

    expect(revised).toMatchObject({
      id: approved.id,
      reviewKey: candidate.reviewKey,
      symbol: 'AAPL',
      status: 'needs_work',
      notes: 'Add timing context.',
      reviewerId: 'reviewer-1',
    })

    const stored = JSON.parse(readFileSync(localReviewPath, 'utf8'))
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({
      id: approved.id,
      status: 'needs_work',
    })
  })
})
