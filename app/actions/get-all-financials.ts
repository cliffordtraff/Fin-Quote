'use server';

import { createClient } from '@/lib/supabase/server';

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
}

interface BalanceSheetYear {
  year: number;
  totalAssets: number;
  currentAssets: number;
  cashAndEquivalents: number;
  totalLiabilities: number;
  currentLiabilities: number;
  longTermDebt: number;
  shareholdersEquity: number;
  debtToEquity: number;
  currentRatio: number;
}

interface CashFlowYear {
  year: number;
  operatingCashFlow: number;
  investingCashFlow: number;
  financingCashFlow: number;
  freeCashFlow: number;
  capitalExpenditures: number;
}

interface AllFinancials {
  incomeStatement: FinancialYear[];
  balanceSheet: BalanceSheetYear[];
  cashFlow: CashFlowYear[];
}

/**
 * Get all financial statements for the last 5 years
 * Returns income statement, balance sheet, and cash flow data
 * Currently hardcoded to AAPL
 */
export async function getAllFinancials(): Promise<AllFinancials> {
  try {
    const supabase = await createClient();

    // Fetch last 5 years of financial data
    const { data: financialsData, error } = await supabase
      .from('financials_std')
      .select('*')
      .order('fiscal_year', { ascending: false })
      .limit(5);

    if (error) {
      console.error('Error fetching financials:', error);
      throw error;
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

      return {
        year: row.fiscal_year,
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
      };
    });

    const balanceSheet: BalanceSheetYear[] = financialsData.map((row) => {
      const totalAssets = row.total_assets || 0;
      const currentAssets = totalAssets * 0.4; // Approximate - not in financials_std
      const totalLiabilities = row.total_liabilities || 0;
      const currentLiabilities = totalLiabilities * 0.5; // Approximate
      const shareholdersEquity = row.shareholders_equity || 0;

      return {
        year: row.fiscal_year,
        totalAssets,
        currentAssets,
        cashAndEquivalents: currentAssets * 0.2, // Approximate
        totalLiabilities,
        currentLiabilities,
        longTermDebt: totalLiabilities * 0.35, // Approximate
        shareholdersEquity,
        debtToEquity: shareholdersEquity > 0 ? totalLiabilities / shareholdersEquity : 0,
        currentRatio: currentLiabilities > 0 ? currentAssets / currentLiabilities : 0,
      };
    });

    const cashFlow: CashFlowYear[] = financialsData.map((row) => {
      const operatingCashFlow = row.operating_cash_flow || 0;
      const capex = operatingCashFlow * 0.1; // Approximate - not in financials_std

      return {
        year: row.fiscal_year,
        operatingCashFlow,
        investingCashFlow: -capex * 1.2, // Approximate (negative)
        financingCashFlow: -(operatingCashFlow * 0.9), // Approximate (negative, buybacks/dividends)
        freeCashFlow: operatingCashFlow - capex,
        capitalExpenditures: capex,
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
