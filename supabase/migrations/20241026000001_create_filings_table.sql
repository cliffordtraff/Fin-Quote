-- Create filings table for SEC filing metadata
-- Run this in Supabase SQL Editor

CREATE TABLE filings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ticker TEXT NOT NULL,
  filing_type TEXT NOT NULL,
  filing_date DATE NOT NULL,
  period_end_date DATE NOT NULL,
  accession_number TEXT UNIQUE NOT NULL,
  document_url TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  fiscal_quarter INTEGER
);

-- Create indexes for fast queries
CREATE INDEX idx_filings_ticker_date ON filings(ticker, filing_date DESC);
CREATE INDEX idx_filings_accession ON filings(accession_number);

-- Add comment for documentation
COMMENT ON TABLE filings IS 'SEC filing metadata (10-K, 10-Q) for AAPL and other companies';
