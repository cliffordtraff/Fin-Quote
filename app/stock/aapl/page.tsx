import Navigation from '@/components/Navigation';
import { getStockOverview } from '@/app/actions/stock-overview';
import { getStockKeyStats } from '@/app/actions/stock-key-stats';
import { getAllFinancials } from '@/app/actions/get-all-financials';
import { getAllMetrics } from '@/app/actions/get-all-metrics';
import { getRecentFilings } from '@/app/actions/filings';
import StockPageClient from './StockPageClient';

export const metadata = {
  title: 'Apple Inc. (AAPL) Stock - Financial Data, Metrics & AI Analysis | Fin Quote',
  description:
    'Comprehensive financial analysis for Apple Inc. (AAPL). View income statements, balance sheets, cash flow, 139+ financial metrics, SEC filings, and AI-powered insights.',
};

// ISR with 60s revalidation
export const revalidate = 60;

export default async function StockPage() {
  // Parallel data fetching for all sections
  const [overview, keyStats, financials, metrics, filings] = await Promise.all([
    getStockOverview(),
    getStockKeyStats(),
    getAllFinancials(),
    getAllMetrics(),
    getRecentFilings('AAPL', 20),
  ]);

  return (
    <>
      <Navigation />
      <div className="page-content">
        <StockPageClient
          overview={overview}
          keyStats={keyStats}
          financials={financials}
          metrics={metrics}
          filings={filings}
        />
      </div>
    </>
  )
}
