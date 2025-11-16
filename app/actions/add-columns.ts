'use server'

import { createServerClient } from '@/lib/supabase/server'

export async function addFinancialColumns() {
  const supabase = await createServerClient()

  // SQL to add new columns to financials_std table
  const sql = `
    ALTER TABLE financials_std
    ADD COLUMN IF NOT EXISTS net_income NUMERIC,
    ADD COLUMN IF NOT EXISTS operating_income NUMERIC,
    ADD COLUMN IF NOT EXISTS total_assets NUMERIC,
    ADD COLUMN IF NOT EXISTS total_liabilities NUMERIC,
    ADD COLUMN IF NOT EXISTS shareholders_equity NUMERIC,
    ADD COLUMN IF NOT EXISTS operating_cash_flow NUMERIC,
    ADD COLUMN IF NOT EXISTS eps NUMERIC;
  `

  try {
    const { data, error } = await (supabase as any).rpc('exec_sql', { sql_query: sql })

    if (error) {
      return {
        success: false,
        error: error.message,
        hint: 'You may need to run this SQL manually in Supabase SQL Editor or create a custom function.'
      }
    }

    return { success: true, error: null, hint: null }
  } catch (err) {
    // If rpc doesn't exist, try direct query (this likely won't work but worth trying)
    const { error } = await (supabase as any).from('_sql').insert({ query: sql })

    if (error) {
      return {
        success: false,
        error: error.message,
        hint: 'Direct SQL execution not available. Please use the SQL migration approach.',
        sqlToRun: sql
      }
    }

    return { success: true, error: null, hint: null }
  }
}
