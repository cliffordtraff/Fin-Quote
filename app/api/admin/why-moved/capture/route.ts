export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { revalidatePath } from 'next/cache'
import { NextRequest } from 'next/server'
import { getAllSessionMovers } from '@/app/actions/market-movers'
import {
  authorizeAdminCommand,
  commandErrorResponse,
  privateJson,
} from '@/app/api/admin/why-moved/_shared'
import { getTradingDate } from '@/lib/market-hours'
import {
  getStockWhyMovingData,
  type StockWhyMovingResult,
} from '@/lib/stock-why-moving'
import {
  ingestWhyMovedEditorialCandidates,
  selectWhyMovedCandidates,
} from '@/lib/why-moved-review'

function captureErrorCatalyst(
  symbol: string,
  error: unknown,
): StockWhyMovingResult {
  return {
    symbol,
    status: 'error',
    displayText: null,
    headline: null,
    summary: null,
    bulletPoints: [],
    sentiment: null,
    source: null,
    sourceTimestamp: null,
    isCatalyst: null,
    sourceUrl: '',
    fetchedAt: new Date().toISOString(),
    errorMessage:
      error instanceof Error ? error.message : 'Catalyst capture failed',
  }
}

/** Explicit heavy command: fans out mover discovery and catalyst capture. */
export async function POST(request: NextRequest) {
  try {
    const authorization = await authorizeAdminCommand(request)
    if (authorization.response) return authorization.response
    request.signal.throwIfAborted()
    const marketDate = getTradingDate()
    const [gainers, losers] = await Promise.all([
      getAllSessionMovers('gainers'),
      getAllSessionMovers('losers'),
    ])
    request.signal.throwIfAborted()
    const candidates = selectWhyMovedCandidates(gainers, losers, marketDate)
    if (candidates.length === 0) {
      return privateJson({
        success: true,
        captured: 0,
        marketDate,
        reviewKeys: [],
      })
    }

    const catalysts = await Promise.all(
      candidates.map(async (candidate) => {
        try {
          return await getStockWhyMovingData(candidate.symbol, {
            signal: request.signal,
          })
        } catch (error) {
          if (request.signal.aborted) throw request.signal.reason ?? error
          return captureErrorCatalyst(candidate.symbol, error)
        }
      }),
    )
    request.signal.throwIfAborted()
    const records = await ingestWhyMovedEditorialCandidates({
      sourceRunId: `admin-capture:${marketDate}:${crypto.randomUUID()}`,
      seenAt: new Date().toISOString(),
      discoveries: candidates.map((candidate, index) => ({
        candidate,
        catalyst: catalysts[index],
      })),
    })
    revalidatePath('/admin/why-moved')
    return privateJson({
      success: true,
      captured: records.length,
      marketDate,
      reviewKeys: records.map((record) => record.reviewKey),
    })
  } catch (error) {
    if (request.signal.aborted) throw request.signal.reason ?? error
    return commandErrorResponse(
      error,
      'Failed to capture current market catalysts',
    )
  }
}
