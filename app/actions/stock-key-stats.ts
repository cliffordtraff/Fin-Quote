'use server';

import { createKeyedAsyncTTLCache } from '@/lib/async-ttl-cache';
import {
  asPercentage,
  firstFiniteNumber,
} from '@/lib/stock-key-stats-normalization';
import {
  getMarketSymbolLookupAliases,
  normalizeMarketSymbol,
  toFmpMarketSymbol,
} from '@/lib/market-symbol';
import { createPublicClient } from '@/lib/supabase/public';

interface StockKeyStats {
  // Column 1: Company Info
  index: string | null;
  marketCap: number | null;
  enterpriseValue: number | null;
  income: number | null; // Net Income
  sales: number | null; // Revenue
  bookValuePerShare: number | null;
  cashPerShare: number | null;
  dividendEst: number | null;
  dividendTTM: number | null;
  dividendExDate: string | null;
  dividendGrowth3Y5Y: number | null;
  payoutRatio: number | null;
  employees: number | null;
  ipoDate: string | null;

  // Column 2: Valuation Ratios
  peRatio: number | null;
  forwardPE: number | null;
  pegRatio: number | null;
  priceToSales: number | null;
  priceToBook: number | null;
  priceToCashFlow: number | null;
  priceToFreeCashFlow: number | null;
  evToEbitda: number | null;
  evToSales: number | null;
  quickRatio: number | null;
  currentRatio: number | null;
  debtToEquity: number | null;
  ltDebtToEquity: number | null;
  optionShort: string | null;

  // Column 3: EPS & Sales
  eps: number | null;
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
  roa: number | null;
  roe: number | null;
  roic: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;

  // Column 5: Shares & Volatility
  sharesOutstanding: number | null;
  sharesFloat: number | null;
  shortFloat: number | null;
  shortRatio: number | null;
  shortInterest: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  volatilityWeek: number | null;
  volatilityMonth: number | null;
  atr14: number | null;
  rsi14: number | null;
  beta: number | null;
  relVolume: number | null;
  avgVolume: number | null;
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
  revenue: number | null;
  netIncome: number | null;
  ytdReturn: number | null;
  oneYearReturn: number | null;
  threeYearCAGR: number | null;
  fiveYearCAGR: number | null;
  operatingCashFlow: number | null;
  freeCashFlow: number | null;
  dividendYield: number | null;
}

const getCachedStockKeyStats = createKeyedAsyncTTLCache<string, StockKeyStats>(
  5 * 60 * 1000
);

async function readFmpArray(
  response: Response,
  label: string,
): Promise<Array<Record<string, unknown>>> {
  if (!response.ok) {
    console.warn(`FMP ${label} request failed with status ${response.status}`);
    return [];
  }

  try {
    const payload: unknown = await response.json();
    return Array.isArray(payload)
      ? payload.filter(
          (entry): entry is Record<string, unknown> =>
            Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry),
        )
      : [];
  } catch (error) {
    console.warn(`FMP ${label} response was not valid JSON`, error);
    return [];
  }
}

function selectFmpRecordForSymbol(
  records: Array<Record<string, unknown>>,
  canonicalSymbol: string,
  label: string,
  requireSymbol = false,
): Record<string, unknown> {
  const record = records[0]
  if (!record) return {}

  const rawSymbol = record.symbol
  if (
    (requireSymbol && typeof rawSymbol !== 'string') ||
    (typeof rawSymbol === 'string' &&
      normalizeMarketSymbol(rawSymbol) !== canonicalSymbol)
  ) {
    throw new Error(`FMP ${label} symbol mismatch for ${canonicalSymbol}`)
  }

  return record
}

/**
 * Get key statistics for stock detail page
 * Combines data from financial_metrics table and FMP API
 * @param symbol - Stock symbol (e.g., 'AAPL', 'MSFT')
 */
async function loadStockKeyStats(symbol: string): Promise<StockKeyStats> {
  const apiKey = process.env.FMP_API_KEY;
  const lookupSymbols = getMarketSymbolLookupAliases(symbol);
  const requestSymbol = toFmpMarketSymbol(symbol);

  if (!apiKey) {
    throw new Error('FMP_API_KEY is not set');
  }

  try {
    const supabase = createPublicClient();

    // Fetch latest metrics from financial_metrics table (key-value format)
    const { data: metricsData, error: metricsError } = await supabase
      .from('financial_metrics')
      .select('metric_name, metric_value, year')
      .in('symbol', lookupSymbols)
      .order('year', { ascending: false })
      .limit(200);

    if (metricsError) {
      console.error('Error fetching financial metrics:', metricsError);
    }

    // Transform key-value rows into an object with metric names as keys
    const latestMetrics: Record<string, number | null> = {};
    metricsData?.forEach((row) => {
      if (!(row.metric_name in latestMetrics)) {
        latestMetrics[row.metric_name] = row.metric_value;
      }
    });

    // Fetch key metrics from FMP API for real-time data
    const [quoteRes, keyMetricsRes, ratiosRes] = await Promise.all([
      fetch(
        `https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(requestSymbol)}?apikey=${apiKey}`,
        { next: { revalidate: 60 } }
      ),
      fetch(
        `https://financialmodelingprep.com/api/v3/key-metrics/${encodeURIComponent(requestSymbol)}?limit=1&apikey=${apiKey}`,
        { next: { revalidate: 3600 } }
      ),
      fetch(
        `https://financialmodelingprep.com/api/v3/ratios/${encodeURIComponent(requestSymbol)}?limit=1&apikey=${apiKey}`,
        { next: { revalidate: 3600 } }
      ),
    ]);

    const [quoteData, keyMetricsData, ratiosData] = await Promise.all([
      readFmpArray(quoteRes, 'quote'),
      readFmpArray(keyMetricsRes, 'key metrics'),
      readFmpArray(ratiosRes, 'ratios'),
    ]);

    const quote = selectFmpRecordForSymbol(
      quoteData,
      symbol,
      'quote',
      true,
    );
    const keyMetrics = selectFmpRecordForSymbol(
      keyMetricsData,
      symbol,
      'key metrics',
    );
    const ratios = selectFmpRecordForSymbol(
      ratiosData,
      symbol,
      'ratios',
    );

    // These datasets are independent. Loading them concurrently keeps a stock
    // page to one database round-trip window instead of six serial waits.
    const [
      { data: financialsData },
      { data: profileData },
      { data: perfData },
      { data: estimatesData },
      { data: earningsData },
      { data: technicalData },
    ] = await Promise.all([
      supabase
        .from('financials_std')
        .select('*')
        .in('symbol', lookupSymbols)
        .order('year', { ascending: false })
        .limit(1),
      supabase
        .from('company_profile')
        .select('*')
        .in('symbol', lookupSymbols)
        .limit(1)
        .maybeSingle(),
      supabase
        .from('price_performance')
        .select('*')
        .in('symbol', lookupSymbols)
        .order('as_of_date', { ascending: false })
        .limit(1),
      supabase
        .from('analyst_estimates')
        .select('*')
        .in('symbol', lookupSymbols)
        .order('period_end', { ascending: false })
        .limit(1),
      supabase
        .from('earnings_history')
        .select('*')
        .in('symbol', lookupSymbols)
        .order('earnings_date', { ascending: false })
        .limit(1),
      supabase
        .from('technical_indicators')
        .select('*')
        .in('symbol', lookupSymbols)
        .order('as_of_date', { ascending: false })
        .limit(1),
    ]);

    const latestFinancials = financialsData?.[0];
    const companyProfile = profileData;
    const pricePerformance = perfData?.[0];
    const analystEstimates = estimatesData?.[0];
    const latestEarnings = earningsData?.[0];
    const technicalIndicators = technicalData?.[0];

    // Calculate some derived values
    const revenue = firstFiniteNumber(latestFinancials?.revenue);
    const netIncome = firstFiniteNumber(latestFinancials?.net_income);
    const sharesOutstanding = firstFiniteNumber(
      quote.sharesOutstanding,
      latestMetrics.numberOfShares,
    );
    const freeCashFlowPerShare = firstFiniteNumber(
      keyMetrics.freeCashFlowPerShare,
      latestMetrics.freeCashFlowPerShare,
    );
    const freeCashFlow = freeCashFlowPerShare !== null && sharesOutstanding !== null
      ? firstFiniteNumber(freeCashFlowPerShare * sharesOutstanding)
      : null;
    const volume = firstFiniteNumber(quote.volume);
    const avgVolume = firstFiniteNumber(quote.avgVolume);
    const relVolume = volume !== null && avgVolume !== null && avgVolume !== 0
      ? firstFiniteNumber(volume / avgVolume)
      : null;

    return {
      // Column 1: Company Info
      index: null, // Would need separate data source (company_profile table)
      marketCap: firstFiniteNumber(
        quote.marketCap,
        latestMetrics.marketCap,
        latestMetrics.marketCapitalization,
      ),
      enterpriseValue: firstFiniteNumber(
        keyMetrics.enterpriseValue,
        latestMetrics.enterpriseValue,
      ),
      income: netIncome,
      sales: revenue,
      bookValuePerShare: firstFiniteNumber(
        keyMetrics.bookValuePerShare,
        latestMetrics.bookValuePerShare,
      ),
      cashPerShare: firstFiniteNumber(
        keyMetrics.cashPerShare,
        latestMetrics.cashPerShare,
      ),
      dividendEst: null, // Forward dividend estimate (analyst_estimates table)
      dividendTTM: firstFiniteNumber(
        latestMetrics.dividendPerShare,
        latestMetrics.dividendYield,
      ),
      dividendExDate: null, // Would need separate API call (company_profile table)
      // Use 3Y or 5Y dividend growth from financial_metrics
      dividendGrowth3Y5Y: asPercentage(
        latestMetrics.threeYDividendperShareGrowthPerShare,
        latestMetrics.fiveYDividendperShareGrowthPerShare,
      ),
      payoutRatio: asPercentage(
        latestMetrics.payoutRatio,
        latestMetrics.dividendPayoutRatio,
      ),
      employees: firstFiniteNumber(companyProfile?.employees),
      ipoDate: companyProfile?.ipo_date || null,

      // Column 2: Valuation Ratios
      peRatio: firstFiniteNumber(quote.pe, latestMetrics.peRatio),
      forwardPE: firstFiniteNumber(keyMetrics.forwardPE, latestMetrics.forwardPE),
      // PEG ratio - check multiple possible field names
      pegRatio: firstFiniteNumber(
        keyMetrics.pegRatio,
        latestMetrics.pegRatio,
        latestMetrics.priceEarningsToGrowthRatio,
      ),
      priceToSales: firstFiniteNumber(
        keyMetrics.priceToSalesRatio,
        latestMetrics.priceToSalesRatio,
        latestMetrics.priceSalesRatio,
      ),
      priceToBook: firstFiniteNumber(
        keyMetrics.pbRatio,
        latestMetrics.pbRatio,
        latestMetrics.ptbRatio,
        latestMetrics.priceToBookRatio,
      ),
      priceToCashFlow: firstFiniteNumber(
        keyMetrics.pfcfRatio,
        latestMetrics.pfcfRatio,
        latestMetrics.priceCashFlowRatio,
        latestMetrics.pocfratio,
      ),
      priceToFreeCashFlow: firstFiniteNumber(
        latestMetrics.priceToFreeCashFlowsRatio,
        latestMetrics.pfcfRatio,
        ratios.priceToFreeCashFlowsRatio,
      ),
      // EV/EBITDA - check enterpriseValueMultiple which is the same thing
      evToEbitda: firstFiniteNumber(
        keyMetrics.enterpriseValueOverEBITDA,
        latestMetrics.enterpriseValueMultiple,
        latestMetrics.enterpriseValueOverEBITDA,
      ),
      evToSales: firstFiniteNumber(latestMetrics.evToSales),
      quickRatio: firstFiniteNumber(latestMetrics.quickRatio, ratios.quickRatio),
      currentRatio: firstFiniteNumber(latestMetrics.currentRatio, ratios.currentRatio),
      debtToEquity: firstFiniteNumber(
        latestMetrics.debtEquityRatio,
        latestMetrics.debtToEquity,
      ),
      // LT Debt/Eq uses longTermDebtToCapitalization
      ltDebtToEquity: firstFiniteNumber(latestMetrics.longTermDebtToCapitalization),
      optionShort: null, // Options/short availability (premium data)

      // Column 3: EPS & Sales
      eps: firstFiniteNumber(quote.eps, latestFinancials?.eps),
      epsNextY: firstFiniteNumber(analystEstimates?.eps_estimated_avg),
      epsNextQ: null, // Next quarter EPS estimate (need quarterly estimates)
      // EPS this year growth - use epsgrowth or netIncomeGrowth
      epsThisYGrowth: asPercentage(
        latestMetrics.epsgrowth,
        latestMetrics.netIncomeGrowth,
      ),
      epsNextYGrowth: null, // Forward EPS growth estimate (analyst_estimates table)
      epsNext5Y: null, // 5-year EPS growth estimate (analyst_estimates table)
      // EPS past 3/5Y - use 3Y or 5Y growth metrics
      epsPast3Y5Y: asPercentage(
        latestMetrics.threeYNetIncomeGrowthPerShare,
        latestMetrics.fiveYNetIncomeGrowthPerShare,
      ),
      // Sales past 3/5Y - use 3Y or 5Y revenue growth metrics
      salesPast3Y5Y: asPercentage(
        latestMetrics.threeYRevenueGrowthPerShare,
        latestMetrics.fiveYRevenueGrowthPerShare,
      ),
      salesYoYTTM: asPercentage(latestMetrics.revenueGrowth),
      epsQoQ: null, // Quarter over quarter EPS (need quarterly data)
      salesQoQ: null, // Quarter over quarter sales (need quarterly data)
      earningsDate: latestEarnings?.earnings_date || null,
      epsSurprise: firstFiniteNumber(latestEarnings?.eps_surprise_pct),
      salesSurprise: firstFiniteNumber(latestEarnings?.revenue_surprise_pct),

      // Column 4: Ownership & Returns
      insiderOwn: null, // Insider ownership % (separate API)
      insiderTrans: null, // Insider transactions (separate API)
      instOwn: null, // Institutional ownership % (separate API)
      instTrans: null, // Institutional transactions (separate API)
      roa: asPercentage(latestMetrics.returnOnAssets, ratios.returnOnAssets),
      roe: asPercentage(latestMetrics.returnOnEquity, ratios.returnOnEquity),
      // ROIC - check roic and returnOnCapitalEmployed
      roic: asPercentage(
        latestMetrics.roic,
        latestMetrics.returnOnCapitalEmployed,
        ratios.returnOnCapitalEmployed,
      ),
      grossMargin: asPercentage(
        latestMetrics.grossProfitMargin,
        ratios.grossProfitMargin,
      ),
      // Operating margin - check operatingProfitMargin and ebitPerRevenue
      operatingMargin: asPercentage(
        latestMetrics.operatingProfitMargin,
        latestMetrics.ebitPerRevenue,
        ratios.operatingProfitMargin,
      ),
      netMargin: asPercentage(
        latestMetrics.netProfitMargin,
        ratios.netProfitMargin,
      ),
      sma20: firstFiniteNumber(technicalIndicators?.sma_20),
      sma50: firstFiniteNumber(technicalIndicators?.sma_50),
      sma200: firstFiniteNumber(technicalIndicators?.sma_200),

      // Column 5: Shares & Volatility
      sharesOutstanding,
      sharesFloat: null, // Shares float (separate API)
      shortFloat: null, // Short % of float (separate API)
      shortRatio: null, // Days to cover (separate API)
      shortInterest: null, // Short interest shares (separate API)
      fiftyTwoWeekHigh: firstFiniteNumber(quote.yearHigh),
      fiftyTwoWeekLow: firstFiniteNumber(quote.yearLow),
      volatilityWeek: firstFiniteNumber(technicalIndicators?.volatility_week),
      volatilityMonth: firstFiniteNumber(technicalIndicators?.volatility_month),
      atr14: firstFiniteNumber(technicalIndicators?.atr_14),
      rsi14: firstFiniteNumber(technicalIndicators?.rsi_14),
      beta: firstFiniteNumber(latestMetrics.beta, keyMetrics.beta),
      relVolume,
      avgVolume,
      volume,

      // Column 6: Performance (price_performance table provides 3Y, 5Y, 10Y)
      perfWeek: firstFiniteNumber(pricePerformance?.perf_5d, quote.priceChange1W),
      perfMonth: firstFiniteNumber(pricePerformance?.perf_1m, quote.priceChange1M),
      perfQuarter: firstFiniteNumber(pricePerformance?.perf_3m, quote.priceChange3M),
      perfHalfY: firstFiniteNumber(pricePerformance?.perf_6m, quote.priceChange6M),
      perfYTD: firstFiniteNumber(pricePerformance?.perf_ytd, quote.ytdChange),
      perfYear: firstFiniteNumber(pricePerformance?.perf_1y, quote.priceChange1Y),
      perf3Y: firstFiniteNumber(pricePerformance?.perf_3y),
      perf5Y: firstFiniteNumber(pricePerformance?.perf_5y),
      perf10Y: firstFiniteNumber(pricePerformance?.perf_10y),
      analystRecom: null, // Analyst recommendation 1-5 (need consensus endpoint)
      targetPrice: firstFiniteNumber(analystEstimates?.target_price, quote.targetPrice),
      prevClose: firstFiniteNumber(quote.previousClose),
      price: firstFiniteNumber(quote.price),
      change: firstFiniteNumber(quote.changesPercentage),

      // Legacy fields for backward compatibility
      revenue,
      netIncome,
      ytdReturn: firstFiniteNumber(quote.ytdChange),
      oneYearReturn: firstFiniteNumber(quote.priceChange1Y),
      threeYearCAGR: asPercentage(
        latestMetrics.threeYRevenueGrowthPerShare,
        latestMetrics.threeYNetIncomeGrowthPerShare,
      ),
      fiveYearCAGR: asPercentage(
        latestMetrics.fiveYRevenueGrowthPerShare,
        latestMetrics.fiveYNetIncomeGrowthPerShare,
      ),
      operatingCashFlow: firstFiniteNumber(latestFinancials?.operating_cash_flow),
      freeCashFlow,
      dividendYield: asPercentage(latestMetrics.dividendYield, quote.dividendYield),
    };
  } catch (error) {
    console.error('Error fetching stock key stats:', error);
    throw error;
  }
}

export async function getStockKeyStats(symbol: string): Promise<StockKeyStats> {
  const normalizedSymbol = normalizeMarketSymbol(symbol);
  return getCachedStockKeyStats(normalizedSymbol, () =>
    loadStockKeyStats(normalizedSymbol)
  );
}
