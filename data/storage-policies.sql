-- Storage policies for filings bucket
-- Run this in Supabase SQL Editor

-- Allow uploads to filings bucket (for scripts and server actions)
CREATE POLICY "Allow uploads to filings bucket"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'filings');

-- Allow reading from filings bucket (for server actions)
CREATE POLICY "Allow reads from filings bucket"
ON storage.objects
FOR SELECT
USING (bucket_id = 'filings');

-- Allow deletes from filings bucket (for cleanup/maintenance)
CREATE POLICY "Allow deletes from filings bucket"
ON storage.objects
FOR DELETE
USING (bucket_id = 'filings');

-- Allow updates to filings bucket (for replacing files)
CREATE POLICY "Allow updates to filings bucket"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'filings')
WITH CHECK (bucket_id = 'filings');
