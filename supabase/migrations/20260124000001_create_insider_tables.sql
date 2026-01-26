CREATE TABLE IF NOT EXISTS insiders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cik TEXT,
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT insiders_name_normalized_unique UNIQUE (name_normalized)
);

CREATE INDEX IF NOT EXISTS idx_insiders_cik ON insiders(cik) WHERE cik IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_insiders_name_normalized ON insiders(name_normalized);

CREATE TABLE IF NOT EXISTS insider_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insider_id UUID REFERENCES insiders(id),
  symbol TEXT NOT NULL,
  accession_number TEXT,
  filing_date DATE NOT NULL,
  transaction_date DATE NOT NULL,
  transaction_type TEXT,
  transaction_code CHAR(1),
  acquisition_disposition CHAR(1),
  shares NUMERIC(18,4) NOT NULL DEFAULT 0,
  price NUMERIC(18,4),
  value NUMERIC(18,2) GENERATED ALWAYS AS (
    CASE WHEN price IS NOT NULL AND shares != 0
         THEN shares * price
         ELSE NULL
    END
  ) STORED,
  shares_owned_after NUMERIC(18,4),
  reporting_name TEXT NOT NULL,
  owner_type TEXT,
  officer_title TEXT,
  security_name TEXT,
  form_type TEXT DEFAULT '4',
  source TEXT NOT NULL DEFAULT 'fmp',
  source_id TEXT,
  sec_link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_insider_tx_accession_dedupe
  ON insider_transactions(accession_number, reporting_name, transaction_date, transaction_code, shares)
  WHERE accession_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_insider_tx_fmp_dedupe
  ON insider_transactions(symbol, reporting_name, transaction_date, transaction_code, shares, price, filing_date)
  WHERE accession_number IS NULL;

CREATE INDEX IF NOT EXISTS idx_insider_tx_latest ON insider_transactions(transaction_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insider_tx_symbol ON insider_transactions(symbol, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_insider_tx_insider_id ON insider_transactions(insider_id, transaction_date DESC) WHERE insider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_insider_tx_reporting_name ON insider_transactions(reporting_name, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_insider_tx_top_value ON insider_transactions(value DESC NULLS LAST) WHERE value IS NOT NULL AND value > 0;
CREATE INDEX IF NOT EXISTS idx_insider_tx_type ON insider_transactions(transaction_code, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_insider_tx_source ON insider_transactions(source, created_at DESC);

CREATE TABLE IF NOT EXISTS ingestion_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'running',
  rows_fetched INTEGER DEFAULT 0,
  rows_inserted INTEGER DEFAULT 0,
  rows_updated INTEGER DEFAULT 0,
  rows_skipped INTEGER DEFAULT 0,
  error_message TEXT,
  error_details JSONB,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ingestion_logs_created ON ingestion_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingestion_logs_source ON ingestion_logs(source, created_at DESC);

ALTER TABLE insiders ENABLE ROW LEVEL SECURITY;
ALTER TABLE insider_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Public read access" ON insiders FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Public read access" ON insider_transactions FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Public read access" ON ingestion_logs FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role insert" ON insiders FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role update" ON insiders FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role insert" ON insider_transactions FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role update" ON insider_transactions FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role insert" ON ingestion_logs FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role update" ON ingestion_logs FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION normalize_insider_name(name TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN LOWER(TRIM(REGEXP_REPLACE(name, '\s+', ' ', 'g')));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION get_or_create_insider(
  p_name TEXT,
  p_cik TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_normalized TEXT;
  v_insider_id UUID;
BEGIN
  v_normalized := normalize_insider_name(p_name);

  SELECT id INTO v_insider_id
  FROM insiders
  WHERE name_normalized = v_normalized;

  IF v_insider_id IS NULL THEN
    INSERT INTO insiders (name, name_normalized, cik)
    VALUES (p_name, v_normalized, p_cik)
    ON CONFLICT (name_normalized) DO UPDATE SET
      cik = COALESCE(EXCLUDED.cik, insiders.cik),
      updated_at = NOW()
    RETURNING id INTO v_insider_id;
  ELSIF p_cik IS NOT NULL THEN
    UPDATE insiders
    SET cik = p_cik, updated_at = NOW()
    WHERE id = v_insider_id AND cik IS NULL;
  END IF;

  RETURN v_insider_id;
END;
$$ LANGUAGE plpgsql;
