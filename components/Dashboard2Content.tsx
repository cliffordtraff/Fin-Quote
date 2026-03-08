'use client'

import { useEffect, useState } from 'react'
import IndexCard from '@/components/IndexCard'
import FuturesCard from '@/components/FuturesCard'
import ForexBondsCard from '@/components/ForexBondsCard'
import SectorCard from '@/components/SectorCard'
import StocksCard from '@/components/StocksCard'
import type { AllMarketData } from '@/lib/market-types'
import { useTimezone, getTimezoneAbbr } from '@/lib/timezone-context'
import { formatTimeInTimezone } from '@/lib/timezone-utils'

interface Dashboard2ContentProps {
  initialData: AllMarketData
}

export default function Dashboard2Content({ initialData }: Dashboard2ContentProps) {
  const { timezone } = useTimezone()
  const [data, setData] = useState<AllMarketData>(initialData)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Set initial timestamp on client mount to avoid hydration mismatch
  useEffect(() => {
    setLastUpdated(new Date())
  }, [])

  async function fetchFast() {
    const res = await fetch('/api/market-snapshot/fast')
    if (!res.ok) throw new Error(`fast snapshot fetch failed: ${res.status}`)
    return (await res.json()) as Partial<AllMarketData>
  }

  async function fetchSlow() {
    const res = await fetch('/api/market-snapshot/slow')
    if (!res.ok) throw new Error(`slow snapshot fetch failed: ${res.status}`)
    return (await res.json()) as Partial<AllMarketData>
  }

  // Polling effect - fast data every 60s, slow data every 10 min
  useEffect(() => {
    const apply = (patch: Partial<AllMarketData>) => {
      setData((prev) => ({ ...prev, ...patch }))
      setLastUpdated(new Date())
    }

    // Refresh slow once on mount (long-lived tabs)
    fetchSlow().then(apply).catch((e) => console.error('Failed to refresh slow market data:', e))

    const fastInterval = setInterval(async () => {
      try {
        apply(await fetchFast())
      } catch (error) {
        console.error('Failed to refresh fast market data:', error)
      }
    }, 60000)

    const slowInterval = setInterval(async () => {
      try {
        apply(await fetchSlow())
      } catch (error) {
        console.error('Failed to refresh slow market data:', error)
      }
    }, 600000)

    return () => {
      clearInterval(fastInterval)
      clearInterval(slowInterval)
    }
  }, [])

  const { futures, gainers, losers, sectors, sparklineIndices, forexBonds } = data

  // Convert sparklineIndices to the format expected by IndexCard
  // sparklineIndices uses: currentPrice, priceChange, priceChangePercent
  const indexData = sparklineIndices
    .filter(idx => idx.currentPrice !== undefined && idx.currentPrice !== null)
    .map(idx => ({
      symbol: idx.symbol,
      name: idx.name,
      price: idx.currentPrice,
      change: idx.priceChange,
      changesPercentage: idx.priceChangePercent,
    }))

  // Get current session movers for display
  const currentGainers = gainers.cash.length > 0 ? gainers.cash : gainers.premarket
  const currentLosers = losers.cash.length > 0 ? losers.cash : losers.premarket

  // Convert MoverData to StockData format
  const gainerStocks = currentGainers.map(g => ({
    symbol: g.symbol,
    name: g.name,
    price: g.price,
    change: g.price * g.changesPercentage / 100, // Calculate change from percentage
    changesPercentage: g.changesPercentage,
  }))

  const loserStocks = currentLosers.map(l => ({
    symbol: l.symbol,
    name: l.name,
    price: l.price,
    change: l.price * l.changesPercentage / 100,
    changesPercentage: l.changesPercentage,
  }))

  // Split forex/bonds data into separate groups
  const forexData = forexBonds.filter(item =>
    !item.symbol.startsWith('^') && item.symbol !== 'BTCUSD' && item.symbol !== 'ETHUSD'
  )
  const bondsData = forexBonds.filter(item => item.symbol.startsWith('^'))
  const cryptoData = forexBonds.filter(item =>
    item.symbol === 'BTCUSD' || item.symbol === 'ETHUSD'
  )

  return (
    <div className="w-full max-w-[1600px] mx-auto px-4">
      {/* Last Updated Note */}
      {lastUpdated && (
        <div className="text-right mb-4 text-xs text-gray-500 dark:text-gray-400">
          Last updated: {formatTimeInTimezone(lastUpdated, timezone)} {getTimezoneAbbr(timezone)}
        </div>
      )}

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {/* Market Overview (Indices) */}
        {indexData.length > 0 && (
          <IndexCard indices={indexData} />
        )}

        {/* Futures */}
        {futures.length > 0 && (
          <FuturesCard futures={futures} />
        )}

        {/* Sectors */}
        {sectors.length > 0 && (
          <SectorCard sectors={sectors} />
        )}

        {/* Forex */}
        {forexData.length > 0 && (
          <ForexBondsCard data={forexData} title="Forex" />
        )}

        {/* Bonds/Treasuries */}
        {bondsData.length > 0 && (
          <ForexBondsCard data={bondsData} title="Treasuries" />
        )}

        {/* Crypto */}
        {cryptoData.length > 0 && (
          <ForexBondsCard data={cryptoData} title="Crypto" />
        )}

        {/* Gainers */}
        {gainerStocks.length > 0 && (
          <StocksCard stocks={gainerStocks} title="Top Gainers" type="gainers" maxItems={8} />
        )}

        {/* Losers */}
        {loserStocks.length > 0 && (
          <StocksCard stocks={loserStocks} title="Top Losers" type="losers" maxItems={8} />
        )}
      </div>
    </div>
  )
}
