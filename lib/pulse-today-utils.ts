import type { MoverData } from '@/app/actions/market-movers'
import type { MarketSession } from '@/lib/market-hours'

const MIN_PULSE_TODAY_MINUTE_BARS = 5
const MIN_PULSE_TODAY_STREAM_BARS = 12

export interface PulseTodayMoversData {
  premarket: MoverData[]
  cash: MoverData[]
  afterhours: MoverData[]
  currentSession: MarketSession
}

export interface PulseTodayCockpitSnapshot {
  session: MarketSession
  gainers: MoverData[]
  losers: MoverData[]
  topGainer: MoverData | null
  topLoser: MoverData | null
  reviewSymbols: string[]
}

function activeSessionMovers(data: PulseTodayMoversData | undefined): MoverData[] {
  if (!data) return []
  if (data.currentSession === 'premarket') return data.premarket
  if (data.currentSession === 'afterhours') return data.afterhours
  return data.cash
}

function uniqueTopSymbols(gainers: MoverData[], losers: MoverData[]): string[] {
  const symbols: string[] = []
  const seen = new Set<string>()

  for (const mover of [...gainers.slice(0, 5), ...losers.slice(0, 5)]) {
    const symbol = mover.symbol.trim().toUpperCase()
    if (!symbol || seen.has(symbol)) continue
    seen.add(symbol)
    symbols.push(symbol)
  }

  return symbols
}

export function buildPulseTodayCockpitSnapshot(
  gainersData?: PulseTodayMoversData,
  losersData?: PulseTodayMoversData,
): PulseTodayCockpitSnapshot {
  const gainers = activeSessionMovers(gainersData)
  const losers = activeSessionMovers(losersData)

  return {
    session:
      gainersData?.currentSession ?? losersData?.currentSession ?? 'closed',
    gainers,
    losers,
    topGainer: gainers[0] ?? null,
    topLoser: losers[0] ?? null,
    reviewSymbols: uniqueTopSymbols(gainers, losers),
  }
}

export function isPulseTodayChartableCandidate(params: {
  quoteExists: boolean
  minuteBars: number
  streamBars: number
  supportsSecondLevel: boolean
}): boolean {
  if (!params.quoteExists) return false
  if (params.minuteBars >= MIN_PULSE_TODAY_MINUTE_BARS) return true
  if (params.supportsSecondLevel && params.streamBars >= MIN_PULSE_TODAY_STREAM_BARS) return true
  return false
}
