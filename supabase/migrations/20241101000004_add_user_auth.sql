-- Migration: Add user authentication support to query_logs
-- Run this in Supabase SQL Editor

-- Step 1: Add user_id column
ALTER TABLE query_logs
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Step 2: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_query_logs_user_id ON query_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_query_logs_session_id ON query_logs(session_id);

-- Step 3: Enable Row Level Security
ALTER TABLE query_logs ENABLE ROW LEVEL SECURITY;

-- Step 4: Drop existing policies if they exist (for re-running migration)
DROP POLICY IF EXISTS "Users can view own queries" ON query_logs;
DROP POLICY IF EXISTS "Users can insert own queries" ON query_logs;
DROP POLICY IF EXISTS "Users can update own queries" ON query_logs;
DROP POLICY IF EXISTS "Users can delete own queries" ON query_logs;

-- Step 5: Create RLS policies

-- Policy: Users can view their own queries (logged in) OR queries from their session (anonymous)
CREATE POLICY "Users can view own queries"
  ON query_logs FOR SELECT
  USING (
    -- Logged in user viewing their queries
    (auth.uid() = user_id)
    OR
    -- Anonymous user viewing their session queries
    (user_id IS NULL AND session_id IS NOT NULL)
  );

-- Policy: Users can insert queries
CREATE POLICY "Users can insert own queries"
  ON query_logs FOR INSERT
  WITH CHECK (
    -- Logged in user inserting with their user_id
    (auth.uid() = user_id)
    OR
    -- Anonymous user inserting with session_id
    (user_id IS NULL AND session_id IS NOT NULL)
  );

-- Policy: Users can update their own queries (for feedback)
CREATE POLICY "Users can update own queries"
  ON query_logs FOR UPDATE
  USING (
    -- Logged in user updating their queries
    (auth.uid() = user_id)
    OR
    -- Anonymous user updating their session queries
    (user_id IS NULL AND session_id IS NOT NULL)
  )
  WITH CHECK (
    -- Ensure they're not changing the user_id or session_id
    (auth.uid() = user_id)
    OR
    (user_id IS NULL AND session_id IS NOT NULL)
  );

-- Policy: Users can delete their own queries
CREATE POLICY "Users can delete own queries"
  ON query_logs FOR DELETE
  USING (
    -- Logged in user deleting their queries
    (auth.uid() = user_id)
    OR
    -- Anonymous user deleting their session queries
    (user_id IS NULL AND session_id IS NOT NULL)
  );

-- Step 6: Verify policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'query_logs';

-- Done! You should see 4 policies listed above.
