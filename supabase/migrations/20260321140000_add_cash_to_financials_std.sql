-- Add cash_and_cash_equivalents column to financials_std.
-- Previously, cash was sourced from financial_metrics (minusCashAndCashEquivalents)
-- which had only ~4% coverage. Moving it to financials_std puts it alongside
-- the other balance sheet fields (total_assets, total_liabilities, shareholders_equity).
alter table public.financials_std
  add column if not exists cash_and_cash_equivalents double precision;
