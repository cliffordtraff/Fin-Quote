export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      company: {
        Row: {
          id: string
          created_at: string
          symbol: string
          name: string
          sector: string
        }
        Insert: {
          id?: string
          created_at?: string
          symbol: string
          name: string
          sector: string
        }
        Update: {
          id?: string
          created_at?: string
          symbol?: string
          name?: string
          sector?: string
        }
        Relationships: []
      }
      financials_std: {
        Row: {
          id: string
          created_at: string
          symbol: string
          year: number
          revenue: number
          gross_profit: number
          net_income: number | null
          operating_income: number | null
          total_assets: number | null
          total_liabilities: number | null
          shareholders_equity: number | null
          operating_cash_flow: number | null
          eps: number | null
        }
        Insert: {
          id?: string
          created_at?: string
          symbol: string
          year: number
          revenue: number
          gross_profit: number
          net_income?: number | null
          operating_income?: number | null
          total_assets?: number | null
          total_liabilities?: number | null
          shareholders_equity?: number | null
          operating_cash_flow?: number | null
          eps?: number | null
        }
        Update: {
          id?: string
          created_at?: string
          symbol?: string
          year?: number
          revenue?: number
          gross_profit?: number
          net_income?: number | null
          operating_income?: number | null
          total_assets?: number | null
          total_liabilities?: number | null
          shareholders_equity?: number | null
          operating_cash_flow?: number | null
          eps?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "financials_std_symbol_fkey"
            columns: ["symbol"]
            referencedRelation: "company"
            referencedColumns: ["symbol"]
          }
        ]
      }
      filings: {
        Row: {
          id: string
          created_at: string
          ticker: string
          filing_type: string
          filing_date: string
          period_end_date: string
          accession_number: string
          document_url: string
          fiscal_year: number
          fiscal_quarter: number | null
        }
        Insert: {
          id?: string
          created_at?: string
          ticker: string
          filing_type: string
          filing_date: string
          period_end_date: string
          accession_number: string
          document_url: string
          fiscal_year: number
          fiscal_quarter?: number | null
        }
        Update: {
          id?: string
          created_at?: string
          ticker?: string
          filing_type?: string
          filing_date?: string
          period_end_date?: string
          accession_number?: string
          document_url?: string
          fiscal_year?: number
          fiscal_quarter?: number | null
        }
        Relationships: []
      }
    }
    Views: {}
    Functions: {}
    Enums: {}
    CompositeTypes: {}
  }
}

// Helper types for easier use
export type Company = Database['public']['Tables']['company']['Row']
export type Financial = Database['public']['Tables']['financials_std']['Row']
export type Filing = Database['public']['Tables']['filings']['Row']

// Type for joined data
export type CompanyWithFinancials = Company & {
  financials_std: Financial[]
}
