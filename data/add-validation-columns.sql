-- Add validation tracking columns to query_logs table
-- Run this in Supabase SQL Editor

-- Add columns for validation results
ALTER TABLE query_logs
ADD COLUMN IF NOT EXISTS validation_results JSONB,
ADD COLUMN IF NOT EXISTS validation_passed BOOLEAN,
ADD COLUMN IF NOT EXISTS validation_run_at TIMESTAMPTZ;

-- Add index for querying validation failures
CREATE INDEX IF NOT EXISTS idx_query_logs_validation_passed
ON query_logs(validation_passed)
WHERE validation_passed IS NOT NULL;

-- Add index for queries that failed validation
CREATE INDEX IF NOT EXISTS idx_query_logs_validation_failed
ON query_logs(validation_passed)
WHERE validation_passed = false;

-- Add comments explaining the columns
COMMENT ON COLUMN query_logs.validation_results IS
'JSONB containing results of all validation checks.
Example structure:
{
  "number_validation": {
    "status": "pass"|"fail"|"skip",
    "checked_numbers": ["383.3B"],
    "matched_values": [383285000000],
    "tolerance": 0.1,
    "details": "..."
  },
  "year_validation": {
    "status": "fail",
    "mentioned_years": [2020],
    "available_years": [2024, 2023, 2022, 2021],
    "missing_years": [2020],
    "severity": "medium",
    "exists_in_db": true
  },
  "filing_validation": {
    "status": "pass"|"fail"|"skip",
    "details": "..."
  },
  "overall_severity": "none"|"low"|"medium"|"high"|"critical",
  "action_taken": "shown"|"regenerated"|"blocked",
  "latency_ms": 45
}';

COMMENT ON COLUMN query_logs.validation_passed IS
'Boolean indicating if all validation checks passed.
NULL = validation not run
TRUE = all checks passed
FALSE = one or more checks failed';

COMMENT ON COLUMN query_logs.validation_run_at IS
'Timestamp when validation was performed';
