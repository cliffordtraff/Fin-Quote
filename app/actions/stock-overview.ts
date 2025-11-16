'use server';

import { getCurrentMarketSession } from '@/lib/market-utils';

interface StockOverview {
  company: {
    name: string;
    symbol: string;
    sector: string;
    industry: string;
  };
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;
  marketStatus: 'open' | 'closed' | 'premarket' | 'afterhours';
}

/**
 * Get stock overview data including current price and company info
 * Currently hardcoded to AAPL
 */
export async function getStockOverview(): Promise<StockOverview> {
  const symbol = 'AAPL';
  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    throw new Error('FMP_API_KEY is not set');
  }

  try {
    // Fetch current quote from FMP API
    const quoteResponse = await fetch(
      `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${apiKey}`,
      { next: { revalidate: 60 } } // Cache for 60 seconds
    );

    if (!quoteResponse.ok) {
      throw new Error(`FMP API error: ${quoteResponse.status}`);
    }

    const quoteData = await quoteResponse.json();

    if (!quoteData || quoteData.length === 0) {
      throw new Error('No quote data returned from FMP API');
    }

    const quote = quoteData[0];

    // Get market session status
    const marketSession = getCurrentMarketSession();

    // Map session to status format expected by the page
    const marketStatus = marketSession === 'regular' ? 'open' :
                        marketSession === 'premarket' ? 'premarket' :
                        marketSession === 'afterhours' ? 'afterhours' : 'closed';

    return {
      company: {
        name: quote.name || 'Apple Inc.',
        symbol: quote.symbol || 'AAPL',
        sector: 'Technology', // Could fetch from profile endpoint if needed
        industry: 'Consumer Electronics',
      },
      currentPrice: quote.price || 0,
      priceChange: quote.change || 0,
      priceChangePercent: quote.changesPercentage || 0,
      marketStatus,
    };
  } catch (error) {
    console.error('Error fetching stock overview:', error);

    // Return fallback data on error
    return {
      company: {
        name: 'Apple Inc.',
        symbol: 'AAPL',
        sector: 'Technology',
        industry: 'Consumer Electronics',
      },
      currentPrice: 0,
      priceChange: 0,
      priceChangePercent: 0,
      marketStatus: getCurrentMarketSession() === 'regular' ? 'open' :
                   getCurrentMarketSession() === 'premarket' ? 'premarket' :
                   getCurrentMarketSession() === 'afterhours' ? 'afterhours' : 'closed',
    };
  }
}
