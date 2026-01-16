'use server'

import { createServerClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export type FilingPassage = {
  chunk_text: string
  section_name: string
  filing_type: string
  filing_date: string
  fiscal_year: number
  fiscal_quarter: number | null
}

// Safe, purpose-built tool for semantic search of filing content
export async function searchFilings(params: {
  query: string
  limit?: number // number of passages to retrieve (1-10)
  symbol?: string // stock symbol to filter by (e.g., 'AAPL', 'GOOGL')
}): Promise<{
  data: FilingPassage[] | null
  error: string | null
  embeddingTokens?: number
}> {
  const { query, symbol } = params
  const requestedLimit = params.limit ?? 5
  const tickerFilter = symbol?.toUpperCase() || null

  // Validate query
  if (!query || query.trim().length === 0) {
    return { data: null, error: 'Query cannot be empty' }
  }

  // Limit results to a safe range (1..10)
  const safeLimit = Math.min(Math.max(requestedLimit, 1), 10)

  try {
    // Step 1: Generate embedding for the query
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    })

    const queryEmbedding = embeddingResponse.data[0].embedding
    const embeddingTokens = embeddingResponse.usage?.total_tokens || 0

    // Step 2: Detect if user is asking for a specific filing type
    const filingTypeMatch = query.match(/10-[KQ]/i)
    const filingTypeFilter = filingTypeMatch ? filingTypeMatch[0].toUpperCase() : null

    // Step 3: Search for similar chunks using vector similarity
    const supabase = await createServerClient()

    // PostgreSQL vector similarity search using <-> operator (cosine distance)
    // Try 4-param version first (with ticker filter), fall back to 3-param, then manual query
    let { data: chunks, error: searchError } = await (supabase as any).rpc(
      'search_filing_chunks',
      {
        query_embedding: JSON.stringify(queryEmbedding),
        match_count: safeLimit,
        filing_type_filter: filingTypeFilter,
        ticker_filter: tickerFilter,
      }
    )

    // If 4-param version doesn't exist, try 3-param version (legacy)
    if (searchError && searchError.code === 'PGRST202') {
      console.log('4-param RPC not found, trying 3-param version...')
      const legacyResult = await (supabase as any).rpc('search_filing_chunks', {
        query_embedding: JSON.stringify(queryEmbedding),
        match_count: safeLimit * 3, // Fetch more to filter client-side
        filing_type_filter: filingTypeFilter,
      })

      if (!legacyResult.error) {
        // Filter by ticker client-side if needed
        let filteredChunks = legacyResult.data || []
        if (tickerFilter && filteredChunks.length > 0) {
          // Need to check ticker from joined filings - use manual query instead
          // The legacy function doesn't return ticker, so fall through to manual query
          console.log('Legacy RPC does not support ticker filtering, using manual query')
        } else {
          chunks = filteredChunks.slice(0, safeLimit)
          searchError = null
        }
      }
    }

    if (searchError) {
      // If RPC function doesn't work, fall back to manual query with proper filtering
      console.log('Using manual query for filing search')

      let queryBuilder = supabase
        .from('filing_chunks')
        .select(`
          chunk_text,
          section_name,
          filings!inner(filing_type, filing_date, fiscal_year, fiscal_quarter, ticker)
        `)
        .not('embedding', 'is', null)

      // Apply ticker filter if specified
      if (tickerFilter) {
        queryBuilder = queryBuilder.eq('filings.ticker', tickerFilter)
      }

      // Apply filing type filter if specified
      if (filingTypeFilter) {
        queryBuilder = queryBuilder.eq('filings.filing_type', filingTypeFilter)
      }

      const { data: manualChunks, error: manualError } = await queryBuilder.limit(safeLimit)

      if (manualError) {
        console.error('Error searching filing chunks:', manualError)
        return { data: null, error: manualError.message }
      }

      // Format response
      const passages: FilingPassage[] = (manualChunks || []).map((chunk: any) => ({
        chunk_text: chunk.chunk_text,
        section_name: chunk.section_name || 'Unknown',
        filing_type: chunk.filings.filing_type,
        filing_date: chunk.filings.filing_date,
        fiscal_year: chunk.filings.fiscal_year,
        fiscal_quarter: chunk.filings.fiscal_quarter,
      }))

      return { data: passages, error: null, embeddingTokens }
    }

    // Format response from RPC function
    const passages: FilingPassage[] = (chunks || []).map((chunk: any) => ({
      chunk_text: chunk.chunk_text,
      section_name: chunk.section_name || 'Unknown',
      filing_type: chunk.filing_type,
      filing_date: chunk.filing_date,
      fiscal_year: chunk.fiscal_year,
      fiscal_quarter: chunk.fiscal_quarter,
    }))

    return { data: passages, error: null, embeddingTokens }
  } catch (err) {
    console.error('Unexpected error (searchFilings):', err)
    return {
      data: null,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    }
  }
}
