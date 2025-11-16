'use server';

import { createClient } from '@/lib/supabase/server';

interface MetricDataPoint {
  metricName: string;
  current: number;
  oneYearAgo: number;
  threeYearsAgo: number;
  fiveYearsAgo: number;
}

interface AllMetrics {
  valuation: MetricDataPoint[];
  profitability: MetricDataPoint[];
  leverage: MetricDataPoint[];
  efficiency: MetricDataPoint[];
  growth: MetricDataPoint[];
  perShare: MetricDataPoint[];
  capitalReturns: MetricDataPoint[];
}

// Categorize metrics by type
const METRIC_CATEGORIES = {
  valuation: [
    'peRatio',
    'pbRatio',
    'priceSalesRatio',
    'enterpriseValueMultiple',
    'pegRatio',
    'marketCapitalization',
    'enterpriseValue',
    'pfcfRatio',
    'pocfratio',
    'earningsYield',
    'freeCashFlowYield',
  ],
  profitability: [
    'returnOnEquity',
    'returnOnAssets',
    'roic',
    'grossProfitMargin',
    'netProfitMargin',
    'ebitPerRevenue',
    'ebitdaMargin',
    'pretaxProfitMargin',
    'returnOnTangibleAssets',
    'returnOnCapitalEmployed',
  ],
  leverage: [
    'debtEquityRatio',
    'debtRatio',
    'currentRatio',
    'quickRatio',
    'cashRatio',
    'interestCoverage',
    'longTermDebtToCapitalization',
    'totalDebtToCapitalization',
    'netDebtToEBITDA',
    'cashFlowToDebtRatio',
  ],
  efficiency: [
    'assetTurnover',
    'inventoryTurnover',
    'receivablesTurnover',
    'payablesTurnover',
    'fixedAssetTurnover',
    'daysOfSalesOutstanding',
    'daysOfInventoryOnHand',
    'daysOfPayablesOutstanding',
    'cashConversionCycle',
    'operatingCycle',
  ],
  growth: [
    'revenueGrowth',
    'netIncomeGrowth',
    'epsgrowth',
    'operatingCashFlowGrowth',
    'freeCashFlowGrowth',
    'grossProfitGrowth',
    'ebitgrowth',
    'threeYRevenueGrowthPerShare',
    'threeYNetIncomeGrowthPerShare',
    'fiveYRevenueGrowthPerShare',
    'fiveYNetIncomeGrowthPerShare',
    'tenYRevenueGrowthPerShare',
    'tenYNetIncomeGrowthPerShare',
  ],
  perShare: [
    'bookValuePerShare',
    'tangibleBookValuePerShare',
    'operatingCashFlowPerShare',
    'freeCashFlowPerShare',
    'cashPerShare',
    'revenuePerShare',
    'netIncomePerShare',
    'capexPerShare',
  ],
  capitalReturns: [
    'dividendYield',
    'payoutRatio',
    'dividendPayoutRatio',
    'commonStockRepurchased',
    'dividendsPaid',
    'capitalExpenditure',
    'numberOfShares',
    'stockBasedCompensationToRevenue',
  ],
};

/**
 * Get all financial metrics grouped by category for the last 5 years
 * Returns data for current year, 1Y ago, 3Y ago, and 5Y ago
 * Currently hardcoded to AAPL
 */
export async function getAllMetrics(): Promise<AllMetrics> {
  try {
    const supabase = await createClient();

    // Get current year
    const currentYear = new Date().getFullYear();
    const targetYears = [
      `${currentYear}-01-01`,      // Current (approximate)
      `${currentYear - 1}-01-01`,  // 1Y ago
      `${currentYear - 3}-01-01`,  // 3Y ago
      `${currentYear - 5}-01-01`,  // 5Y ago
    ];

    // Fetch all metrics for relevant years
    const { data: metricsData, error } = await supabase
      .from('financial_metrics')
      .select('*')
      .order('date', { ascending: false })
      .limit(20); // Get recent data points

    if (error) {
      console.error('Error fetching metrics:', error);
      throw error;
    }

    if (!metricsData || metricsData.length === 0) {
      return {
        valuation: [],
        profitability: [],
        leverage: [],
        efficiency: [],
        growth: [],
        perShare: [],
        capitalReturns: [],
      };
    }

    // Sort by date descending
    const sortedData = metricsData.sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Helper function to get metric value by year offset
    const getMetricValue = (metricKey: string, yearOffset: number): number => {
      const targetIndex = Math.min(yearOffset, sortedData.length - 1);
      const row = sortedData[targetIndex];
      return row?.[metricKey] || 0;
    };

    // Helper function to transform category metrics
    const transformCategoryMetrics = (metricKeys: string[]): MetricDataPoint[] => {
      return metricKeys.map(metricKey => ({
        metricName: metricKey,
        current: getMetricValue(metricKey, 0),
        oneYearAgo: getMetricValue(metricKey, 1),
        threeYearsAgo: getMetricValue(metricKey, 3),
        fiveYearsAgo: getMetricValue(metricKey, 5),
      })).filter(m => m.current !== 0 || m.oneYearAgo !== 0); // Filter out empty metrics
    };

    return {
      valuation: transformCategoryMetrics(METRIC_CATEGORIES.valuation),
      profitability: transformCategoryMetrics(METRIC_CATEGORIES.profitability),
      leverage: transformCategoryMetrics(METRIC_CATEGORIES.leverage),
      efficiency: transformCategoryMetrics(METRIC_CATEGORIES.efficiency),
      growth: transformCategoryMetrics(METRIC_CATEGORIES.growth),
      perShare: transformCategoryMetrics(METRIC_CATEGORIES.perShare),
      capitalReturns: transformCategoryMetrics(METRIC_CATEGORIES.capitalReturns),
    };
  } catch (error) {
    console.error('Error in getAllMetrics:', error);
    return {
      valuation: [],
      profitability: [],
      leverage: [],
      efficiency: [],
      growth: [],
      perShare: [],
      capitalReturns: [],
    };
  }
}
