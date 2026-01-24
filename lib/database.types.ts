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
          period_type: string
          fiscal_quarter: number | null
          fiscal_label: string | null
          period_end_date: string | null
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
          period_type?: string
          fiscal_quarter?: number | null
          fiscal_label?: string | null
          period_end_date?: string | null
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
          period_type?: string
          fiscal_quarter?: number | null
          fiscal_label?: string | null
          period_end_date?: string | null
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
      financial_metrics: {
        Row: {
          id: number
          symbol: string
          year: number
          period: string | null
          metric_name: string
          metric_value: number | null
          metric_category: string | null
          data_source: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          symbol: string
          year: number
          period?: string | null
          metric_name: string
          metric_value?: number | null
          metric_category?: string | null
          data_source?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          symbol?: string
          year?: number
          period?: string | null
          metric_name?: string
          metric_value?: number | null
          metric_category?: string | null
          data_source?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          id: string
          user_id: string
          title: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          role: 'user' | 'assistant'
          content: string
          created_at: string
          chart_config: Json | null
          follow_up_questions: string[] | null
          data_used: Json | null
        }
        Insert: {
          id?: string
          conversation_id: string
          role: 'user' | 'assistant'
          content: string
          created_at?: string
          chart_config?: Json | null
          follow_up_questions?: string[] | null
          data_used?: Json | null
        }
        Update: {
          id?: string
          conversation_id?: string
          role?: 'user' | 'assistant'
          content?: string
          chart_config?: Json | null
          follow_up_questions?: string[] | null
          data_used?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          }
        ]
      }
      insiders: {
        Row: {
          id: string
          cik: string | null
          name: string
          name_normalized: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          cik?: string | null
          name: string
          name_normalized: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          cik?: string | null
          name?: string
          name_normalized?: string
          updated_at?: string
        }
        Relationships: []
      }
      insider_transactions: {
        Row: {
          id: string
          insider_id: string | null
          symbol: string
          accession_number: string | null
          filing_date: string
          transaction_date: string
          transaction_type: string | null
          transaction_code: string | null
          acquisition_disposition: string | null
          shares: number
          price: number | null
          value: number | null
          shares_owned_after: number | null
          reporting_name: string
          owner_type: string | null
          officer_title: string | null
          security_name: string | null
          form_type: string | null
          source: string
          source_id: string | null
          sec_link: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          insider_id?: string | null
          symbol: string
          accession_number?: string | null
          filing_date: string
          transaction_date: string
          transaction_type?: string | null
          transaction_code?: string | null
          acquisition_disposition?: string | null
          shares: number
          price?: number | null
          shares_owned_after?: number | null
          reporting_name: string
          owner_type?: string | null
          officer_title?: string | null
          security_name?: string | null
          form_type?: string | null
          source?: string
          source_id?: string | null
          sec_link?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          insider_id?: string | null
          symbol?: string
          accession_number?: string | null
          filing_date?: string
          transaction_date?: string
          transaction_type?: string | null
          transaction_code?: string | null
          acquisition_disposition?: string | null
          shares?: number
          price?: number | null
          shares_owned_after?: number | null
          reporting_name?: string
          owner_type?: string | null
          officer_title?: string | null
          security_name?: string | null
          form_type?: string | null
          source?: string
          source_id?: string | null
          sec_link?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insider_transactions_insider_id_fkey"
            columns: ["insider_id"]
            referencedRelation: "insiders"
            referencedColumns: ["id"]
          }
        ]
      }
      ingestion_logs: {
        Row: {
          id: string
          source: string
          started_at: string
          completed_at: string | null
          status: string
          rows_fetched: number
          rows_inserted: number
          rows_updated: number
          rows_skipped: number
          error_message: string | null
          error_details: Json | null
          duration_ms: number | null
          created_at: string
        }
        Insert: {
          id?: string
          source: string
          started_at: string
          completed_at?: string | null
          status?: string
          rows_fetched?: number
          rows_inserted?: number
          rows_updated?: number
          rows_skipped?: number
          error_message?: string | null
          error_details?: Json | null
          duration_ms?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          source?: string
          started_at?: string
          completed_at?: string | null
          status?: string
          rows_fetched?: number
          rows_inserted?: number
          rows_updated?: number
          rows_skipped?: number
          error_message?: string | null
          error_details?: Json | null
          duration_ms?: number | null
        }
        Relationships: []
      }
    }
    Views: {}
    Functions: {
      generate_conversation_title: {
        Args: { conversation_id: string }
        Returns: string
      }
      normalize_insider_name: {
        Args: { name: string }
        Returns: string
      }
      get_or_create_insider: {
        Args: { p_name: string; p_cik?: string | null }
        Returns: string
      }
    }
    Enums: {}
    CompositeTypes: {}
  }
}

// Helper types for easier use
export type Company = Database['public']['Tables']['company']['Row']
export type Financial = Database['public']['Tables']['financials_std']['Row']
export type Filing = Database['public']['Tables']['filings']['Row']
export type FinancialMetric = Database['public']['Tables']['financial_metrics']['Row']
export type Conversation = Database['public']['Tables']['conversations']['Row']
export type Message = Database['public']['Tables']['messages']['Row']
export type Insider = Database['public']['Tables']['insiders']['Row']
export type InsiderTransaction = Database['public']['Tables']['insider_transactions']['Row']
export type IngestionLog = Database['public']['Tables']['ingestion_logs']['Row']

// Type for joined data
export type CompanyWithFinancials = Company & {
  financials_std: Financial[]
}

export type ConversationWithMessages = Conversation & {
  messages: Message[]
}

export type InsiderWithTransactions = Insider & {
  insider_transactions: InsiderTransaction[]
}
