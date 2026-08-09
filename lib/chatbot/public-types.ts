export type FinancialData = {
  year: number
  value: number
  metric: string
}

export type PriceData = {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type FilingData = {
  filing_type: string
  filing_date: string
  period_end_date: string
  fiscal_year: number
  fiscal_quarter: number | null
  document_url: string
}

export type PassageData = {
  chunk_text: string
  section_name: string
  filing_type: string
  filing_date: string
  fiscal_year: number
  fiscal_quarter: number | null
}
