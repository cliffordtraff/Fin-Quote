-- Add unique constraint on source_id for fast batch upserts
-- source_id is already populated as "{accession_number}-{transaction_sk}" for SEC data

CREATE UNIQUE INDEX IF NOT EXISTS idx_insider_tx_source_id_unique
  ON insider_transactions(source_id)
  WHERE source_id IS NOT NULL;
