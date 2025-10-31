-- Simple storage policy: Allow all operations on filings bucket
-- Run this in Supabase SQL Editor

-- Allow all operations (insert, select, update, delete) on filings bucket
CREATE POLICY "Allow all operations on filings bucket"
ON storage.objects
FOR ALL
USING (bucket_id = 'filings')
WITH CHECK (bucket_id = 'filings');
