'use server';

import { createServerClient } from '@/lib/supabase/server';

interface FinancialYear {
  year: number;
  revenue: number;
  costOfRevenue: number;
  grossProfit: number;
  grossMargin: number;
  operatingExpenses: number;
  operatingIncome: number;
  operatingMargin: number;
  netIncome: number;
  netMargin: number;
  eps: number;
  // Additional metrics
  ebitda: number | null;
  stockBasedCompensation: number | null;
  peRatio: number | null;
  priceToSalesRatio: number | null;
  sharesOutstanding: number | null;
  marketCap: number | null;
}

interface BalanceSheetYear {
  year: number;
  // Assets
  cashAndShortTermInvestments: number | null;
  shortTermReceivables: number | null;
  inventories: number | null;
  otherCurrentAssets: number | null;
  totalCurrentAssets: number | null;
  netPropertyPlantEquipment: number | null;
  totalInvestmentsAndAdvances: number | null;
  longTermNoteReceivable: number | null;
  intangibleAssets: number | null;
  deferredTaxAssets: number | null;
  otherAssets: number | null;
  totalAssets: number | null;
  // Liabilities
  shortTermDebt: number | null;
  accountsPayable: number | null;
  incomeTaxPayable: number | null;
  otherCurrentLiabilities: number | null;
  totalCurrentLiabilities: number | null;
  longTermDebt: number | null;
  provisionForRisksCharges: number | null;
  deferredTaxLiabilities: number | null;
  otherLiabilities: number | null;
  totalLiabilities: number | null;
  // Equity
  nonEquityReserves: number | null;
  preferredStock: number | null;
  commonEquity: number | null;
  totalShareholdersEquity: number | null;
  accumulatedMinorityInterest: number | null;
  totalEquity: number | null;
  totalLiabilitiesAndEquity: number | null;
  // Per Share & Ratios
  bookValuePerShare: number | null;
  tangibleBookValuePerShare: number | null;
  fullTimeEmployees: number | null;
  priceToBookRatio: number | null;
  returnOnAssets: number | null;
  returnOnEquity: number | null;
  returnOnInvestedCapital: number | null;
  quickRatio: number | null;
  currentRatio: number | null;
}

interface CashFlowYear {
  year: number;
  // Operating Activities
  netIncome: number | null;
  depreciation: number | null;
  otherFundsNonCash: number | null;
  fundsFromOperations: number | null;
  extraordinaryItem: number | null;
  changesInWorkingCapital: number | null;
  incomeTaxesPayable: number | null;
  cashFromOperatingActivities: number | null;
  // Investing Activities
  capitalExpenditures: number | null;
  netAssetsFromAcquisitions: number | null;
  saleOfFixedAssetsAndBusinesses: number | null;
  purchaseOrSaleOfInvestments: number | null;
  purchaseOfInvestments: number | null;
  saleOrMaturityOfInvestments: number | null;
  otherUses: number | null;
  otherSources: number | null;
  cashFromInvestingActivities: number | null;
  // Financing Activities
  cashDividendsPaid: number | null;
  changeInCapitalStock: number | null;
  repurchaseOfCommonPrefStock: number | null;
  saleOfCommonPrefStock: number | null;
  proceedsFromStockOptions: number | null;
  issuanceOrReductionOfDebtNet: number | null;
  changeInLongTermDebt: number | null;
  issuanceOfLongTermDebt: number | null;
  reductionOfLongTermDebt: number | null;
  netFinancingActiveOtherCashFlow: number | null;
  otherFinancingActivitiesUses: number | null;
  cashFromFinancingActivities: number | null;
  // Summary
  exchangeRateEffect: number | null;
  netChangeInCash: number | null;
  freeCashFlow: number | null;
  preferredDividends: number | null;
  priceToFreeCashFlow: number | null;
}

interface AllFinancials {
  incomeStatement: FinancialYear[];
  balanceSheet: BalanceSheetYear[];
  cashFlow: CashFlowYear[];
}

/**
 * Get all financial statements for the last 8 years
 * Returns income statement, balance sheet, and cash flow data
 * @param symbol - Stock symbol (e.g., 'AAPL', 'MSFT')
 */
export async function getAllFinancials(symbol: string): Promise<AllFinancials> {
  try {
    const supabase = await createServerClient();

    // Fetch last 8 years of annual financial data from financials_std
    const { data: financialsData, error } = await supabase
      .from('financials_std')
      .select('*')
      .eq('symbol', symbol)
      .eq('period_type', 'annual')
      .order('year', { ascending: false })
      .limit(8);

    if (error) {
      console.error('Error fetching financials:', error);
      throw error;
    }

    // Also fetch additional metrics from financial_metrics table
    const additionalMetrics = [
      // Income statement metrics
      'ebitda',
      'stockBasedCompensation',
      'peRatio',
      'priceToSalesRatio',
      'numberOfShares',
      'marketCap',
      // Balance sheet metrics
      'bookValuePerShare',
      'tangibleBookValuePerShare',
      'priceToBookRatio',
      'returnOnAssets',
      'returnOnEquity',
      'roic',
      'quickRatio',
      'currentRatio',
      // Cash flow metrics
      'freeCashFlow',
      'capitalExpenditure',
      'priceToFreeCashFlowsRatio',
      'depreciationAndAmortization',
      'dividendsPaid',
      'commonStockRepurchased',
    ];

    const { data: metricsData, error: metricsError } = await supabase
      .from('financial_metrics')
      .select('year, metric_name, metric_value')
      .eq('symbol', symbol)
      .eq('period_type', 'annual')
      .in('metric_name', additionalMetrics)
      .order('year', { ascending: false });

    if (metricsError) {
      console.error('Error fetching additional metrics:', metricsError);
    }

    // Create a lookup map for additional metrics: { year: { metricName: value } }
    const metricsMap: Record<number, Record<string, number | null>> = {};
    if (metricsData) {
      for (const row of metricsData) {
        if (!metricsMap[row.year]) {
          metricsMap[row.year] = {};
        }
        metricsMap[row.year][row.metric_name] = row.metric_value;
      }
    }

    if (!financialsData || financialsData.length === 0) {
      return {
        incomeStatement: [],
        balanceSheet: [],
        cashFlow: [],
      };
    }

    // Transform data into separate statement arrays
    const incomeStatement: FinancialYear[] = financialsData.map((row) => {
      const revenue = row.revenue || 0;
      const costOfRevenue = row.cost_of_revenue || 0;
      const grossProfit = row.gross_profit || 0;
      const operatingIncome = row.operating_income || 0;
      const netIncome = row.net_income || 0;
      const yearMetrics = metricsMap[row.year] || {};

      return {
        year: row.year,
        revenue,
        costOfRevenue,
        grossProfit,
        grossMargin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
        operatingExpenses: grossProfit - operatingIncome, // Derived
        operatingIncome,
        operatingMargin: revenue > 0 ? (operatingIncome / revenue) * 100 : 0,
        netIncome,
        netMargin: revenue > 0 ? (netIncome / revenue) * 100 : 0,
        eps: row.eps || 0,
        // Additional metrics from financial_metrics table
        ebitda: yearMetrics['ebitda'] ?? null,
        stockBasedCompensation: yearMetrics['stockBasedCompensation'] ?? null,
        peRatio: yearMetrics['peRatio'] ?? null,
        priceToSalesRatio: yearMetrics['priceToSalesRatio'] ?? null,
        sharesOutstanding: yearMetrics['numberOfShares'] ?? null,
        marketCap: yearMetrics['marketCap'] ?? null,
      };
    });

    const balanceSheet: BalanceSheetYear[] = financialsData.map((row) => {
      const totalAssets = row.total_assets || null;
      const totalLiabilities = row.total_liabilities || null;
      const shareholdersEquity = row.shareholders_equity || null;
      const yearMetrics = metricsMap[row.year] || {};

      return {
        year: row.year,
        // Assets - most are null until we ingest detailed balance sheet data
        cashAndShortTermInvestments: null,
        shortTermReceivables: null,
        inventories: null,
        otherCurrentAssets: null,
        totalCurrentAssets: null,
        netPropertyPlantEquipment: null,
        totalInvestmentsAndAdvances: null,
        longTermNoteReceivable: null,
        intangibleAssets: null,
        deferredTaxAssets: null,
        otherAssets: null,
        totalAssets,
        // Liabilities - most are null until we ingest detailed balance sheet data
        shortTermDebt: null,
        accountsPayable: null,
        incomeTaxPayable: null,
        otherCurrentLiabilities: null,
        totalCurrentLiabilities: null,
        longTermDebt: null,
        provisionForRisksCharges: null,
        deferredTaxLiabilities: null,
        otherLiabilities: null,
        totalLiabilities,
        // Equity - most are null until we ingest detailed balance sheet data
        nonEquityReserves: null,
        preferredStock: null,
        commonEquity: null,
        totalShareholdersEquity: shareholdersEquity,
        accumulatedMinorityInterest: null,
        totalEquity: shareholdersEquity,
        totalLiabilitiesAndEquity: totalAssets, // Should equal total assets
        // Per Share & Ratios - from financial_metrics table
        bookValuePerShare: yearMetrics['bookValuePerShare'] ?? null,
        tangibleBookValuePerShare: yearMetrics['tangibleBookValuePerShare'] ?? null,
        fullTimeEmployees: null, // Not in our database yet
        priceToBookRatio: yearMetrics['priceToBookRatio'] ?? null,
        returnOnAssets: yearMetrics['returnOnAssets'] ? yearMetrics['returnOnAssets'] * 100 : null,
        returnOnEquity: yearMetrics['returnOnEquity'] ? yearMetrics['returnOnEquity'] * 100 : null,
        returnOnInvestedCapital: yearMetrics['roic'] ? yearMetrics['roic'] * 100 : null,
        quickRatio: yearMetrics['quickRatio'] ?? null,
        currentRatio: yearMetrics['currentRatio'] ?? null,
      };
    });

    const cashFlow: CashFlowYear[] = financialsData.map((row) => {
      const operatingCashFlow = row.operating_cash_flow || null;
      const netIncome = row.net_income || null;
      const yearMetrics = metricsMap[row.year] || {};

      return {
        year: row.year,
        // Operating Activities
        netIncome,
        depreciation: yearMetrics['depreciationAndAmortization'] ?? null,
        otherFundsNonCash: null,
        fundsFromOperations: null,
        extraordinaryItem: null,
        changesInWorkingCapital: null,
        incomeTaxesPayable: null,
        cashFromOperatingActivities: operatingCashFlow,
        // Investing Activities
        capitalExpenditures: yearMetrics['capitalExpenditure'] ?? null,
        netAssetsFromAcquisitions: null,
        saleOfFixedAssetsAndBusinesses: null,
        purchaseOrSaleOfInvestments: null,
        purchaseOfInvestments: null,
        saleOrMaturityOfInvestments: null,
        otherUses: null,
        otherSources: null,
        cashFromInvestingActivities: null,
        // Financing Activities
        cashDividendsPaid: yearMetrics['dividendsPaid'] ?? null,
        changeInCapitalStock: null,
        repurchaseOfCommonPrefStock: yearMetrics['commonStockRepurchased'] ?? null,
        saleOfCommonPrefStock: null,
        proceedsFromStockOptions: null,
        issuanceOrReductionOfDebtNet: null,
        changeInLongTermDebt: null,
        issuanceOfLongTermDebt: null,
        reductionOfLongTermDebt: null,
        netFinancingActiveOtherCashFlow: null,
        otherFinancingActivitiesUses: null,
        cashFromFinancingActivities: null,
        // Summary
        exchangeRateEffect: null,
        netChangeInCash: null,
        freeCashFlow: yearMetrics['freeCashFlow'] ?? null,
        preferredDividends: null,
        priceToFreeCashFlow: yearMetrics['priceToFreeCashFlowsRatio'] ?? null,
      };
    });

    return {
      incomeStatement,
      balanceSheet,
      cashFlow,
    };
  } catch (error) {
    console.error('Error in getAllFinancials:', error);
    return {
      incomeStatement: [],
      balanceSheet: [],
      cashFlow: [],
    };
  }
}
