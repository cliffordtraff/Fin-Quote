import { cache } from 'react'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import Navigation from '@/components/Navigation'
import StockPriceHeader from '@/components/StockPriceHeader'
import CompanySegmentsCard from '@/components/CompanySegmentsCard'
import FundamentalsTable from '@/components/FundamentalsTable'
import { getStockOverview } from '@/app/actions/stock-overview'
import { getCompanyProfile } from '@/app/actions/get-company-profile'
import { getSegmentData } from '@/app/actions/segment-data'
import { getCompanyFundamentals } from '@/app/actions/company-fundamentals'
import { isValidSymbol } from '@/lib/symbol-resolver'

interface PageProps {
  params: Promise<{ symbol: string }>
}

// Cached profile loader
const getCachedProfile = cache(async (symbol: string) => {
  return getCompanyProfile(symbol)
})

// Dynamic metadata
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { symbol } = await params
  const normalizedSymbol = symbol.toUpperCase()

  try {
    const profile = await getCachedProfile(normalizedSymbol)
    if (!profile) {
      return {
        title: `${normalizedSymbol} Company Summary - The Intraday`,
        description: `Company summary and fundamentals for ${normalizedSymbol}`,
      }
    }
    return {
      title: `${profile.companyName} (${normalizedSymbol}) Company Summary | The Intraday`,
      description: `Company summary, segment breakdown, and fundamentals for ${profile.companyName} (${normalizedSymbol}).`,
    }
  } catch {
    return {
      title: `${normalizedSymbol} Company Summary - The Intraday`,
      description: `Company summary and fundamentals for ${normalizedSymbol}`,
    }
  }
}

// ISR with 60s revalidation
export const revalidate = 60

export default async function CompanyPage({ params }: PageProps) {
  const { symbol } = await params
  const normalizedSymbol = symbol.toUpperCase()

  // Validate symbol exists
  const valid = await isValidSymbol(normalizedSymbol)
  if (!valid) {
    notFound()
  }

  // Parallel data fetching
  const [overview, productSegmentsResult, geoSegmentsResult, fundamentals] = await Promise.all([
    getStockOverview(normalizedSymbol).catch(() => null),
    getSegmentData({ symbol: normalizedSymbol, segmentType: 'product', periodType: 'annual' }).catch(() => ({ data: null, error: 'Failed to fetch', segmentType: 'product' as const, periodType: 'annual' as const })),
    getSegmentData({ symbol: normalizedSymbol, segmentType: 'geographic', periodType: 'annual' }).catch(() => ({ data: null, error: 'Failed to fetch', segmentType: 'geographic' as const, periodType: 'annual' as const })),
    getCompanyFundamentals(normalizedSymbol).catch(() => ({ metrics: [], annualYears: [], quarterlyPeriods: [], error: 'Failed to fetch' })),
  ])

  // If we couldn't get basic overview data, show a message
  if (!overview) {
    return (
      <div className="min-h-screen bg-white dark:bg-[rgb(45,45,45)]">
        <Navigation />
        <div className="mx-auto max-w-7xl px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            {normalizedSymbol}
          </h1>
          <p className="text-amber-600 dark:text-amber-400">
            Data for {normalizedSymbol} is currently being loaded. Please check back soon!
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[rgb(45,45,45)]">
      {/* Navigation Header */}
      <Navigation />

      {/* Stock Header Section - Sticky with Client-Side Polling */}
      <StockPriceHeader
        symbol={normalizedSymbol}
        companyName={overview.company.name}
        sector={overview.company.sector}
        initialPrice={overview.currentPrice}
        initialPriceChange={overview.priceChange}
        initialPriceChangePercent={overview.priceChangePercent}
        initialMarketStatus={overview.marketStatus}
      />

      {/* Segments Section */}
      <section className="bg-white dark:bg-[rgb(45,45,45)]">
        <div className="mx-auto max-w-7xl px-4 pt-4 pb-2 sm:px-6 lg:px-8">
          <CompanySegmentsCard
            productSegments={productSegmentsResult.data}
            geographicSegments={geoSegmentsResult.data}
          />
        </div>
      </section>

      {/* Fundamentals Section */}
      <section className="bg-white dark:bg-[rgb(45,45,45)]">
        <div className="mx-auto max-w-7xl px-4 py-2 sm:px-6 lg:px-8">
          <FundamentalsTable data={fundamentals} />
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white dark:bg-[rgb(45,45,45)] border-t border-gray-200 dark:border-gray-800 mt-8">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              &copy; {new Date().getFullYear()} The Intraday. All rights reserved.
            </div>
            </div>
        </div>
      </footer>
    </div>
  )
}
