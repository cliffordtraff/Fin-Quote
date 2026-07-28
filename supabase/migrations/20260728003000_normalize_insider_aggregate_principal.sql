-- Some debt Form 4 filings report aggregate principal in both `shares` and
-- `price`. Preserve one dollar of principal as one unit so the generated
-- `value` column and its ranking index remain accurate.

CREATE OR REPLACE FUNCTION normalize_insider_aggregate_principal_price()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.shares >= 1000000
     AND NEW.price = NEW.shares
     AND COALESCE(NEW.security_name, '') ~* '\m(bond|bonds|debenture|debentures|note|notes)\M'
  THEN
    NEW.price := 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_insider_aggregate_principal_price
  ON insider_transactions;

CREATE TRIGGER normalize_insider_aggregate_principal_price
BEFORE INSERT OR UPDATE OF shares, price, security_name
ON insider_transactions
FOR EACH ROW
EXECUTE FUNCTION normalize_insider_aggregate_principal_price();

-- Avoid an FMP partial-index collision if a normalized copy was inserted
-- before this migration reached an older raw row.
DELETE FROM insider_transactions AS malformed
USING insider_transactions AS normalized
WHERE malformed.id <> normalized.id
  AND malformed.accession_number IS NULL
  AND normalized.accession_number IS NULL
  AND malformed.shares >= 1000000
  AND malformed.price = malformed.shares
  AND COALESCE(malformed.security_name, '') ~* '\m(bond|bonds|debenture|debentures|note|notes)\M'
  AND normalized.price = 1
  AND normalized.symbol = malformed.symbol
  AND normalized.reporting_name = malformed.reporting_name
  AND normalized.transaction_date = malformed.transaction_date
  AND normalized.transaction_code IS NOT DISTINCT FROM malformed.transaction_code
  AND normalized.shares = malformed.shares
  AND normalized.filing_date = malformed.filing_date;

UPDATE insider_transactions
SET price = 1
WHERE shares >= 1000000
  AND price = shares
  AND COALESCE(security_name, '') ~* '\m(bond|bonds|debenture|debentures|note|notes)\M';
