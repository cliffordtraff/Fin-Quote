-- Add error categorization and review columns to query_logs table
-- Run this in Supabase SQL Editor after creating the review system

-- Add columns for manual review and error categorization
ALTER TABLE query_logs
ADD COLUMN IF NOT EXISTS error_category TEXT,
ADD COLUMN IF NOT EXISTS reviewer_notes TEXT,
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id);

-- Add index for filtering by error category
CREATE INDEX IF NOT EXISTS idx_query_logs_error_category ON query_logs(error_category);

-- Add index for filtering by reviewed status
CREATE INDEX IF NOT EXISTS idx_query_logs_reviewed_at ON query_logs(reviewed_at);

-- Add index for feedback filtering
CREATE INDEX IF NOT EXISTS idx_query_logs_user_feedback ON query_logs(user_feedback);

-- Add comment
COMMENT ON COLUMN query_logs.error_category IS 'Manual categorization of errors: wrong_tool, wrong_arguments, wrong_units, hallucination, correct_data_wrong_interpretation, etc.';
COMMENT ON COLUMN query_logs.reviewer_notes IS 'Free-form notes from reviewer about why query failed or what should be improved';
COMMENT ON COLUMN query_logs.reviewed_at IS 'Timestamp when query was reviewed by a human';
COMMENT ON COLUMN query_logs.reviewed_by IS 'User ID of the reviewer who categorized this query';
