import type { Metadata } from 'next'
import ChartsPageClient from './ChartsPageClient'
import { getAvailableMetrics } from '@/app/actions/chart-metrics'
import type { Stock } from '@/app/actions/get-stocks'
import sp500Constituents from '@/data/sp500-constituents.json'

export const metadata: Metadata = {
  title: 'Main Charting - Fin Quote',
}

type LocalStockRow = {
  symbol: string
  name: string
  sector?: string | null
  is_active?: boolean
}

const initialAvailableStocks: Stock[] = (sp500Constituents as LocalStockRow[])
  .filter((stock) => stock.is_active !== false)
  .sort((a, b) => a.symbol.localeCompare(b.symbol))
  .map((stock) => ({
    symbol: stock.symbol,
    name: stock.name,
    sector: stock.sector ?? undefined,
  }))

export default async function MainChartingPage() {
  const initialAvailableMetrics = await getAvailableMetrics()

  return (
    <ChartsPageClient
      initialAvailableMetrics={initialAvailableMetrics}
      initialAvailableStocks={initialAvailableStocks}
    />
  )
}
