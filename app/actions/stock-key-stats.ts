'use server';

import { createServerClient } from '@/lib/supabase/server';

interface StockKeyStats {
  // Column 1: Company Info
  index: string | null;
  marketCap: number;
  enterpriseValue: number;
  income: number; // Net Income
  sales: number; // Revenue
  bookValuePerShare: number | null;
  cashPerShare: number | null;
  dividendEst: number | null;
  dividendTTM: number | null;
  dividendExDate: string | null;
  dividendGrowth3Y5Y: number | null;
  payoutRatio: number;
  employees: number | null;
  ipoDate: string | null;

  // Column 2: Valuation Ratios
  peRatio: number;
  forwardPE: number | null;
  pegRatio: number | null;
  priceToSales: number;
  priceToBook: number;
  priceToCashFlow: number;
  priceToFreeCashFlow: number | null;
  evToEbitda: number | null;
  evToSales: number | null;
  quickRatio: number;
  currentRatio: number;
  debtToEquity: number | null;
  ltDebtToEquity: number | null;
  optionShort: string | null;

  // Column 3: EPS & Sales
  eps: number;
  epsNextY: number | null;
  epsNextQ: number | null;
  epsThisYGrowth: number | null;
  epsNextYGrowth: number | null;
  epsNext5Y: number | null;
  epsPast3Y5Y: number | null;
  salesPast3Y5Y: number | null;
  salesYoYTTM: number | null;
  epsQoQ: number | null;
  salesQoQ: number | null;
  earningsDate: string | null;
  epsSurprise: number | null;
  salesSurprise: number | null;

  // Column 4: Ownership & Returns
  insiderOwn: number | null;
  insiderTrans: number | null;
  instOwn: number | null;
  instTrans: number | null;
  roa: number;
  roe: number;
  roic: number;
  grossMargin: number;
  operatingMargin: number;
  netMargin: number;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;

  // Column 5: Shares & Volatility
  sharesOutstanding: number | null;
  sharesFloat: number | null;
  shortFloat: number | null;
  shortRatio: number | null;
  shortInterest: number | null;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  volatilityWeek: number | null;
  volatilityMonth: number | null;
  atr14: number | null;
  rsi14: number | null;
  beta: number | null;
  relVolume: number | null;
  avgVolume: number;
  volume: number | null;

  // Column 6: Performance
  perfWeek: number | null;
  perfMonth: number | null;
  perfQuarter: number | null;
  perfHalfY: number | null;
  perfYTD: number | null;
  perfYear: number | null;
  perf3Y: number | null;
  perf5Y: number | null;
  perf10Y: number | null;
  analystRecom: number | null;
  targetPrice: number | null;
  prevClose: number | null;
  price: number | null;
  change: number | null;

  // Legacy fields for backward compatibility
  revenue: number;
  netIncome: number;
  ytdReturn: number;
  oneYearReturn: number;
  threeYearCAGR: number;
  fiveYearCAGR: number;
  operatingCashFlow: number;
  freeCashFlow: number;
  dividendYield: number;
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
    const supabase = await createServerClient();

    // Fetch latest metrics from financial_metrics table (key-value format)
    const { data: metricsData, error: metricsError } = await supabase
      .from('financial_metrics')
      .select('metric_name, metric_value, year')
      .eq('symbol', symbol)
      .order('year', { ascending: false })
      .limit(200);

    if (metricsError) {
      console.error('Error fetching financial metrics:', metricsError);
    }

    // Transform key-value rows into an object with metric names as keys
    const latestMetrics: Record<string, number> = {};
    metricsData?.forEach((row) => {
      if (!latestMetrics[row.metric_name]) {
        latestMetrics[row.metric_name] = row.metric_value;
      }
    });

    // Fetch key metrics from FMP API for real-time data
    const [quoteRes, keyMetricsRes, ratiosRes] = await Promise.all([
      fetch(
        `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${apiKey}`,
        { next: { revalidate: 60 } }
      ),
      fetch(
        `https://financialmodelingprep.com/api/v3/key-metrics/${symbol}?limit=1&apikey=${apiKey}`,
        { next: { revalidate: 3600 } }
      ),
      fetch(
        `https://financialmodelingprep.com/api/v3/ratios/${symbol}?limit=1&apikey=${apiKey}`,
        { next: { revalidate: 3600 } }
      ),
    ]);

    const quoteData = await quoteRes.json();
    const keyMetricsData = await keyMetricsRes.json();
    const ratiosData = await ratiosRes.json();

    const quote = quoteData?.[0] || {};
    const keyMetrics = keyMetricsData?.[0] || {};
    const ratios = ratiosData?.[0] || {};

    // Fetch latest financials for TTM data
    const { data: financialsData } = await supabase
      .from('financials_std')
      .select('*')
      .order('year', { ascending: false })
      .limit(1);

    const latestFinancials = financialsData?.[0] || {};

    // Calculate some derived values
    const revenue = latestFinancials.revenue || 0;
    const netIncome = latestFinancials.net_income || 0;
    const freeCashFlow = keyMetrics.freeCashFlowPerShare
      ? keyMetrics.freeCashFlowPerShare * (quote.sharesOutstanding || 1)
      : (latestMetrics.freeCashFlowPerShare ? latestMetrics.freeCashFlowPerShare * (quote.sharesOutstanding || 1) : 0);

    return {
      // Column 1: Company Info
      index: null, // Would need separate data source
      marketCap: quote.marketCap || latestMetrics.marketCap || latestMetrics.marketCapitalization || 0,
      enterpriseValue: keyMetrics.enterpriseValue || latestMetrics.enterpriseValue || 0,
      income: netIncome,
      sales: revenue,
      bookValuePerShare: keyMetrics.bookValuePerShare || latestMetrics.bookValuePerShare || null,
      cashPerShare: keyMetrics.cashPerShare || latestMetrics.cashPerShare || null,
      dividendEst: null, // Forward dividend estimate
      dividendTTM: latestMetrics.dividendPerShare || null,
      dividendExDate: null, // Would need separate API call
      dividendGrowth3Y5Y: null, // Need to calculate
      payoutRatio: (latestMetrics.payoutRatio || latestMetrics.dividendPayoutRatio || 0) * 100,
      employees: null, // From company profile
      ipoDate: null, // From company profile

      // Column 2: Valuation Ratios
      peRatio: quote.pe || latestMetrics.peRatio || 0,
      forwardPE: keyMetrics.forwardPE || latestMetrics.forwardPE || null,
      pegRatio: keyMetrics.pegRatio || latestMetrics.pegRatio || null,
      priceToSales: keyMetrics.priceToSalesRatio || latestMetrics.priceToSalesRatio || latestMetrics.priceSalesRatio || 0,
      priceToBook: keyMetrics.pbRatio || latestMetrics.priceToBookRatio || latestMetrics.pbRatio || 0,
      priceToCashFlow: keyMetrics.pfcfRatio || latestMetrics.priceCashFlowRatio || latestMetrics.pfcfRatio || 0,
      priceToFreeCashFlow: latestMetrics.priceToFreeCashFlowsRatio || ratios.priceToFreeCashFlowsRatio || null,
      evToEbitda: keyMetrics.enterpriseValueOverEBITDA || latestMetrics.enterpriseValueOverEBITDA || null,
      evToSales: latestMetrics.evToSales || null,
      quickRatio: latestMetrics.quickRatio || 0,
      currentRatio: latestMetrics.currentRatio || 0,
      debtToEquity: latestMetrics.debtToEquity || latestMetrics.debtEquityRatio || null,
      ltDebtToEquity: latestMetrics.longTermDebtToCapitalization || null,
      optionShort: null, // Options/short availability

      // Column 3: EPS & Sales
      eps: quote.eps || latestFinancials.eps || 0,
      epsNextY: null, // Forward EPS estimate
      epsNextQ: null, // Next quarter EPS estimate
      epsThisYGrowth: latestMetrics.netIncomeGrowth ? latestMetrics.netIncomeGrowth * 100 : null,
      epsNextYGrowth: null, // Forward EPS growth estimate
      epsNext5Y: null, // 5-year EPS growth estimate
      epsPast3Y5Y: latestMetrics.threeYNetIncomeGrowthPerShare ? latestMetrics.threeYNetIncomeGrowthPerShare * 100 : null,
      salesPast3Y5Y: latestMetrics.threeYRevenueGrowthPerShare ? latestMetrics.threeYRevenueGrowthPerShare * 100 : null,
      salesYoYTTM: latestMetrics.revenueGrowth ? latestMetrics.revenueGrowth * 100 : null,
      epsQoQ: null, // Quarter over quarter EPS
      salesQoQ: null, // Quarter over quarter sales
      earningsDate: null, // Next earnings date
      epsSurprise: null, // Last EPS surprise %
      salesSurprise: null, // Last sales surprise %

      // Column 4: Ownership & Returns
      insiderOwn: null, // Insider ownership %
      insiderTrans: null, // Insider transactions
      instOwn: null, // Institutional ownership %
      instTrans: null, // Institutional transactions
      roa: (latestMetrics.returnOnAssets || latestMetrics.roa || 0) * 100,
      roe: (latestMetrics.returnOnEquity || latestMetrics.roe || 0) * 100,
      roic: (latestMetrics.returnOnCapitalEmployed || latestMetrics.roic || 0) * 100,
      grossMargin: (latestMetrics.grossProfitMargin || 0) * 100,
      operatingMargin: (latestMetrics.operatingProfitMargin || latestMetrics.ebitPerRevenue || 0) * 100,
      netMargin: (latestMetrics.netProfitMargin || 0) * 100,
      sma20: null, // 20-day SMA vs price %
      sma50: null, // 50-day SMA vs price %
      sma200: null, // 200-day SMA vs price %

      // Column 5: Shares & Volatility
      sharesOutstanding: quote.sharesOutstanding || latestMetrics.numberOfShares || null,
      sharesFloat: null, // Shares float
      shortFloat: null, // Short % of float
      shortRatio: null, // Days to cover
      shortInterest: null, // Short interest shares
      fiftyTwoWeekHigh: quote.yearHigh || 0,
      fiftyTwoWeekLow: quote.yearLow || 0,
      volatilityWeek: null, // Weekly volatility
      volatilityMonth: null, // Monthly volatility
      atr14: null, // Average True Range 14
      rsi14: null, // RSI 14
      beta: keyMetrics.beta || latestMetrics.beta || null,
      relVolume: quote.volume && quote.avgVolume ? quote.volume / quote.avgVolume : null,
      avgVolume: quote.avgVolume || 0,
      volume: quote.volume || null,

      // Column 6: Performance
      perfWeek: quote.priceChange1W || null,
      perfMonth: quote.priceChange1M || null,
      perfQuarter: quote.priceChange3M || null,
      perfHalfY: quote.priceChange6M || null,
      perfYTD: quote.ytdChange || null,
      perfYear: quote.priceChange1Y || null,
      perf3Y: null, // 3-year performance
      perf5Y: null, // 5-year performance
      perf10Y: null, // 10-year performance
      analystRecom: null, // Analyst recommendation (1-5)
      targetPrice: quote.targetPrice || null,
      prevClose: quote.previousClose || null,
      price: quote.price || null,
      change: quote.changesPercentage || null,

      // Legacy fields for backward compatibility
      revenue,
      netIncome,
      ytdReturn: quote.ytdChange || 0,
      oneYearReturn: quote.priceChange1Y || 0,
      threeYearCAGR: (latestMetrics.threeYRevenueGrowthPerShare || latestMetrics.threeYNetIncomeGrowthPerShare || 0) * 100,
      fiveYearCAGR: (latestMetrics.fiveYRevenueGrowthPerShare || latestMetrics.fiveYNetIncomeGrowthPerShare || 0) * 100,
      operatingCashFlow: latestFinancials.operating_cash_flow || 0,
      freeCashFlow,
      dividendYield: (quote.dividendYield || latestMetrics.dividendYield || 0) * 100,
    };
  } catch (error) {
    console.error('Error fetching stock key stats:', error);

    // Return zeros/nulls on error
    return {
      index: null,
      marketCap: 0,
      enterpriseValue: 0,
      income: 0,
      sales: 0,
      bookValuePerShare: null,
      cashPerShare: null,
      dividendEst: null,
      dividendTTM: null,
      dividendExDate: null,
      dividendGrowth3Y5Y: null,
      payoutRatio: 0,
      employees: null,
      ipoDate: null,
      peRatio: 0,
      forwardPE: null,
      pegRatio: null,
      priceToSales: 0,
      priceToBook: 0,
      priceToCashFlow: 0,
      priceToFreeCashFlow: null,
      evToEbitda: null,
      evToSales: null,
      quickRatio: 0,
      currentRatio: 0,
      debtToEquity: null,
      ltDebtToEquity: null,
      optionShort: null,
      eps: 0,
      epsNextY: null,
      epsNextQ: null,
      epsThisYGrowth: null,
      epsNextYGrowth: null,
      epsNext5Y: null,
      epsPast3Y5Y: null,
      salesPast3Y5Y: null,
      salesYoYTTM: null,
      epsQoQ: null,
      salesQoQ: null,
      earningsDate: null,
      epsSurprise: null,
      salesSurprise: null,
      insiderOwn: null,
      insiderTrans: null,
      instOwn: null,
      instTrans: null,
      roa: 0,
      roe: 0,
      roic: 0,
      grossMargin: 0,
      operatingMargin: 0,
      netMargin: 0,
      sma20: null,
      sma50: null,
      sma200: null,
      sharesOutstanding: null,
      sharesFloat: null,
      shortFloat: null,
      shortRatio: null,
      shortInterest: null,
      fiftyTwoWeekHigh: 0,
      fiftyTwoWeekLow: 0,
      volatilityWeek: null,
      volatilityMonth: null,
      atr14: null,
      rsi14: null,
      beta: null,
      relVolume: null,
      avgVolume: 0,
      volume: null,
      perfWeek: null,
      perfMonth: null,
      perfQuarter: null,
      perfHalfY: null,
      perfYTD: null,
      perfYear: null,
      perf3Y: null,
      perf5Y: null,
      perf10Y: null,
      analystRecom: null,
      targetPrice: null,
      prevClose: null,
      price: null,
      change: null,
      revenue: 0,
      netIncome: 0,
      ytdReturn: 0,
      oneYearReturn: 0,
      threeYearCAGR: 0,
      fiveYearCAGR: 0,
      operatingCashFlow: 0,
      freeCashFlow: 0,
      dividendYield: 0,
    };
  }
}
