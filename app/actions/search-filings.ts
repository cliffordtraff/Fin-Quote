'use server'

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
  return {
    data: null,
    error:
      'Filing content search is temporarily disabled. Available data: financials, metrics, and filing metadata.',
  }
}
