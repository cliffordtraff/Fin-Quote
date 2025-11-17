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
      watchlists: {
        Row: {
          user_id: string
          tabs: Json
          active_tab_index: number
          updated_at: string
        }
        Insert: {
          user_id: string
          tabs?: Json
          active_tab_index?: number
          updated_at?: string
        }
        Update: {
          user_id?: string
          tabs?: Json
          active_tab_index?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlists_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      watchlist_settings: {
        Row: {
          user_id: string
          show_extended_hours: boolean
          column_widths: Json
          font_scale: number
          updated_at: string
        }
        Insert: {
          user_id: string
          show_extended_hours?: boolean
          column_widths?: Json
          font_scale?: number
          updated_at?: string
        }
        Update: {
          user_id?: string
          show_extended_hours?: boolean
          column_widths?: Json
          font_scale?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_settings_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
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
    }
    Views: {}
    Functions: {
      generate_conversation_title: {
        Args: { conversation_id: string }
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

// Type for joined data
export type CompanyWithFinancials = Company & {
  financials_std: Financial[]
}

export type ConversationWithMessages = Conversation & {
  messages: Message[]
}
