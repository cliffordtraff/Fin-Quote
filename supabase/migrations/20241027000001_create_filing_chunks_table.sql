-- Phase 4: Enable pgvector and create filing_chunks table
-- Run this in Supabase SQL Editor

-- Step 1: Enable pgvector extension (allows vector columns)
CREATE EXTENSION IF NOT EXISTS vector;

-- Step 2: Create filing_chunks table for RAG
CREATE TABLE filing_chunks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  filing_id UUID NOT NULL REFERENCES filings(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(1536),  -- OpenAI text-embedding-3-small dimensions
  section_name TEXT,
  page_number INTEGER,
  word_count INTEGER,
  UNIQUE(filing_id, chunk_index)
);

-- Step 3: Create index for vector similarity search
CREATE INDEX ON filing_chunks USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Step 4: Create index for filing_id lookups
CREATE INDEX idx_filing_chunks_filing_id ON filing_chunks(filing_id);

-- Step 5: Add comments for documentation
COMMENT ON TABLE filing_chunks IS 'Chunked text passages from SEC filings with embeddings for RAG search';
COMMENT ON COLUMN filing_chunks.embedding IS 'Vector embedding from OpenAI text-embedding-3-small (1536 dimensions)';
COMMENT ON COLUMN filing_chunks.chunk_index IS 'Sequential index of chunk within the filing (0-based)';
