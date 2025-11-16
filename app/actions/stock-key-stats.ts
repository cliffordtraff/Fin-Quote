'use server';

import { createClient } from '@/lib/supabase/server';

interface StockKeyStats {
  // Valuation
  marketCap: number;
  enterpriseValue: number;
  peRatio: number;
  forwardPE: number;
  pegRatio: number;
  priceToSales: number;
  priceToBook: number;
  priceToCashFlow: number;

  // Performance
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  ytdReturn: number;
  oneYearReturn: number;
  threeYearCAGR: number;
  fiveYearCAGR: number;
  beta: number;
  avgVolume: number;

  // Profitability
  grossMargin: number;
  operatingMargin: number;
  netMargin: number;
  roe: number;
  roa: number;
  roic: number;
  revenue: number;
  netIncome: number;

  // Financial Health
  debtToEquity: number;
  currentRatio: number;
  quickRatio: number;
  operatingCashFlow: number;
  freeCashFlow: number;
  dividendYield: number;
  payoutRatio: number;
  eps: number;
}

/**
 * Get key statistics for stock detail page
 * Combines data from financial_metrics table and FMP API
 * Currently hardcoded to AAPL
 */
export async function getStockKeyStats(): Promise<StockKeyStats> {
  const symbol = 'AAPL';
  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    throw new Error('FMP_API_KEY is not set');
  }

  try {
    const supabase = await createClient();

    // Fetch latest metrics from financial_metrics table
    const { data: metricsData, error: metricsError } = await supabase
      .from('financial_metrics')
      .select('*')
      .order('date', { ascending: false })
      .limit(1);

    if (metricsError) {
      console.error('Error fetching financial metrics:', metricsError);
    }

    const latestMetrics = metricsData?.[0] || {};

    // Fetch key metrics from FMP API for real-time data
    const [quoteRes, keyMetricsRes] = await Promise.all([
      fetch(
        `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${apiKey}`,
        { next: { revalidate: 60 } }
      ),
      fetch(
        `https://financialmodelingprep.com/api/v3/key-metrics/${symbol}?limit=1&apikey=${apiKey}`,
        { next: { revalidate: 3600 } } // Cache for 1 hour
      ),
    ]);

    const quoteData = await quoteRes.json();
    const keyMetricsData = await keyMetricsRes.json();

    const quote = quoteData?.[0] || {};
    const keyMetrics = keyMetricsData?.[0] || {};

    // Fetch latest financials for TTM data
    const { data: financialsData } = await supabase
      .from('financials_std')
      .select('*')
      .order('fiscal_year', { ascending: false })
      .limit(1);

    const latestFinancials = financialsData?.[0] || {};

    return {
      // Valuation
      marketCap: quote.marketCap || latestMetrics.marketCap || 0,
      enterpriseValue: keyMetrics.enterpriseValue || latestMetrics.enterpriseValue || 0,
      peRatio: quote.pe || latestMetrics.peRatio || 0,
      forwardPE: keyMetrics.forwardPE || 0,
      pegRatio: keyMetrics.pegRatio || latestMetrics.pegRatio || 0,
      priceToSales: keyMetrics.priceToSalesRatio || latestMetrics.priceToSalesRatio || 0,
      priceToBook: keyMetrics.pbRatio || latestMetrics.priceToBookRatio || 0,
      priceToCashFlow: keyMetrics.pfcfRatio || latestMetrics.priceCashFlowRatio || 0,

      // Performance
      fiftyTwoWeekHigh: quote.yearHigh || 0,
      fiftyTwoWeekLow: quote.yearLow || 0,
      ytdReturn: quote.ytdChange || 0,
      oneYearReturn: 0, // Would need to calculate from historical prices
      threeYearCAGR: latestMetrics.revenuePerShareThreeYearGrowth || 0,
      fiveYearCAGR: latestMetrics.revenuePerShareFiveYearGrowth || 0,
      beta: keyMetrics.beta || 0,
      avgVolume: quote.avgVolume || 0,

      // Profitability
      grossMargin: (latestMetrics.grossProfitMargin || 0) * 100,
      operatingMargin: (latestMetrics.operatingIncomeMargin || 0) * 100,
      netMargin: (latestMetrics.netIncomeMargin || 0) * 100,
      roe: (latestMetrics.returnOnEquity || 0) * 100,
      roa: (latestMetrics.returnOnAssets || 0) * 100,
      roic: (latestMetrics.returnOnCapitalEmployed || 0) * 100,
      revenue: latestFinancials.revenue || 0,
      netIncome: latestFinancials.net_income || 0,

      // Financial Health
      debtToEquity: latestMetrics.debtToEquity || 0,
      currentRatio: latestMetrics.currentRatio || 0,
      quickRatio: latestMetrics.quickRatio || 0,
      operatingCashFlow: latestFinancials.operating_cash_flow || 0,
      freeCashFlow: keyMetrics.freeCashFlowPerShare ? keyMetrics.freeCashFlowPerShare * (quote.sharesOutstanding || 1) : 0,
      dividendYield: (quote.dividendYield || 0) * 100,
      payoutRatio: (latestMetrics.payoutRatio || 0) * 100,
      eps: quote.eps || latestFinancials.eps || 0,
    };
  } catch (error) {
    console.error('Error fetching stock key stats:', error);

    // Return zeros on error
    return {
      marketCap: 0,
      enterpriseValue: 0,
      peRatio: 0,
      forwardPE: 0,
      pegRatio: 0,
      priceToSales: 0,
      priceToBook: 0,
      priceToCashFlow: 0,
      fiftyTwoWeekHigh: 0,
      fiftyTwoWeekLow: 0,
      ytdReturn: 0,
      oneYearReturn: 0,
      threeYearCAGR: 0,
      fiveYearCAGR: 0,
      beta: 0,
      avgVolume: 0,
      grossMargin: 0,
      operatingMargin: 0,
      netMargin: 0,
      roe: 0,
      roa: 0,
      roic: 0,
      revenue: 0,
      netIncome: 0,
      debtToEquity: 0,
      currentRatio: 0,
      quickRatio: 0,
      operatingCashFlow: 0,
      freeCashFlow: 0,
      dividendYield: 0,
      payoutRatio: 0,
      eps: 0,
    };
  }
}
