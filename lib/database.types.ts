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
          period_type: string
          fiscal_quarter: number | null
          fiscal_label: string | null
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
          period_type?: string
          fiscal_quarter?: number | null
          fiscal_label?: string | null
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
          period_type?: string
          fiscal_quarter?: number | null
          fiscal_label?: string | null
          metric_name?: string
          metric_value?: number | null
          metric_category?: string | null
          data_source?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_metrics: {
        Row: {
          id: number
          symbol: string
          year: number
          period: string | null
          metric_name: string
          metric_value: number | null
          unit: string | null
          dimension_type: string | null
          dimension_value: string | null
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
          unit?: string | null
          dimension_type?: string | null
          dimension_value?: string | null
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
          unit?: string | null
          dimension_type?: string | null
          dimension_value?: string | null
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
      query_logs: {
        Row: {
          id: string
          session_id: string
          user_question: string
          tool_selected: string
          tool_args: Json
          tool_selection_latency_ms: number | null
          data_returned: Json | null
          data_row_count: number | null
          tool_execution_latency_ms: number | null
          tool_error: string | null
          answer_generated: string
          answer_latency_ms: number | null
          created_at: string
          user_feedback: string | null
          user_feedback_comment: string | null
          tool_selection_prompt_tokens: number | null
          tool_selection_completion_tokens: number | null
          tool_selection_total_tokens: number | null
          answer_prompt_tokens: number | null
          answer_completion_tokens: number | null
          answer_total_tokens: number | null
          regeneration_prompt_tokens: number | null
          regeneration_completion_tokens: number | null
          regeneration_total_tokens: number | null
          embedding_tokens: number | null
          total_cost_usd: number | null
          error_category: string | null
          reviewer_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          validation_results: Json | null
          validation_passed: boolean | null
          validation_run_at: string | null
          tool_selection_prompt_version: number | null
          answer_generation_prompt_version: number | null
        }
        Insert: {
          id?: string
          session_id: string
          user_question: string
          tool_selected: string
          tool_args: Json
          tool_selection_latency_ms?: number | null
          data_returned?: Json | null
          data_row_count?: number | null
          tool_execution_latency_ms?: number | null
          tool_error?: string | null
          answer_generated: string
          answer_latency_ms?: number | null
          created_at?: string
          user_feedback?: string | null
          user_feedback_comment?: string | null
          tool_selection_prompt_tokens?: number | null
          tool_selection_completion_tokens?: number | null
          tool_selection_total_tokens?: number | null
          answer_prompt_tokens?: number | null
          answer_completion_tokens?: number | null
          answer_total_tokens?: number | null
          regeneration_prompt_tokens?: number | null
          regeneration_completion_tokens?: number | null
          regeneration_total_tokens?: number | null
          embedding_tokens?: number | null
          total_cost_usd?: number | null
          error_category?: string | null
          reviewer_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          validation_results?: Json | null
          validation_passed?: boolean | null
          validation_run_at?: string | null
          tool_selection_prompt_version?: number | null
          answer_generation_prompt_version?: number | null
        }
        Update: {
          id?: string
          session_id?: string
          user_question?: string
          tool_selected?: string
          tool_args?: Json
          tool_selection_latency_ms?: number | null
          data_returned?: Json | null
          data_row_count?: number | null
          tool_execution_latency_ms?: number | null
          tool_error?: string | null
          answer_generated?: string
          answer_latency_ms?: number | null
          user_feedback?: string | null
          user_feedback_comment?: string | null
          total_cost_usd?: number | null
          error_category?: string | null
          reviewer_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          validation_results?: Json | null
          validation_passed?: boolean | null
          validation_run_at?: string | null
        }
        Relationships: []
      }
      sp500_constituents: {
        Row: {
          id: string
          symbol: string
          name: string
          cik: string | null
          sector: string | null
          sub_industry: string | null
          headquarters_location: string | null
          date_added: string | null
          date_removed: string | null
          is_active: boolean | null
          data_status: Json | null
          alternate_symbols: Json | null
          fiscal_year_end_month: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          symbol: string
          name: string
          cik?: string | null
          sector?: string | null
          sub_industry?: string | null
          headquarters_location?: string | null
          date_added?: string | null
          date_removed?: string | null
          is_active?: boolean | null
          data_status?: Json | null
          alternate_symbols?: Json | null
          fiscal_year_end_month?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          symbol?: string
          name?: string
          cik?: string | null
          sector?: string | null
          sub_industry?: string | null
          headquarters_location?: string | null
          date_added?: string | null
          date_removed?: string | null
          is_active?: boolean | null
          data_status?: Json | null
          alternate_symbols?: Json | null
          fiscal_year_end_month?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      company_profile: {
        Row: {
          id: number
          symbol: string
          company_name: string | null
          exchange: string | null
          sector: string | null
          industry: string | null
          description: string | null
          ceo: string | null
          employees: number | null
          headquarters: string | null
          country: string | null
          website: string | null
          ipo_date: string | null
          fiscal_year_end: string | null
          is_sp500: boolean | null
          is_nasdaq100: boolean | null
          is_dow30: boolean | null
          last_updated: string | null
          created_at: string
        }
        Insert: {
          id?: number
          symbol: string
          company_name?: string | null
          exchange?: string | null
          sector?: string | null
          industry?: string | null
          description?: string | null
          ceo?: string | null
          employees?: number | null
          headquarters?: string | null
          country?: string | null
          website?: string | null
          ipo_date?: string | null
          fiscal_year_end?: string | null
          is_sp500?: boolean | null
          is_nasdaq100?: boolean | null
          is_dow30?: boolean | null
          last_updated?: string | null
          created_at?: string
        }
        Update: {
          symbol?: string
          company_name?: string | null
          exchange?: string | null
          sector?: string | null
          industry?: string | null
          description?: string | null
          ceo?: string | null
          employees?: number | null
          headquarters?: string | null
          country?: string | null
          website?: string | null
          ipo_date?: string | null
          fiscal_year_end?: string | null
          is_sp500?: boolean | null
          is_nasdaq100?: boolean | null
          is_dow30?: boolean | null
          last_updated?: string | null
        }
        Relationships: []
      }
      price_performance: {
        Row: {
          id: number
          symbol: string
          as_of_date: string
          perf_1d: number | null
          perf_5d: number | null
          perf_1m: number | null
          perf_3m: number | null
          perf_6m: number | null
          perf_ytd: number | null
          perf_1y: number | null
          perf_3y: number | null
          perf_5y: number | null
          perf_10y: number | null
          perf_max: number | null
          created_at: string
        }
        Insert: {
          id?: number
          symbol: string
          as_of_date: string
          perf_1d?: number | null
          perf_5d?: number | null
          perf_1m?: number | null
          perf_3m?: number | null
          perf_6m?: number | null
          perf_ytd?: number | null
          perf_1y?: number | null
          perf_3y?: number | null
          perf_5y?: number | null
          perf_10y?: number | null
          perf_max?: number | null
          created_at?: string
        }
        Update: {
          symbol?: string
          as_of_date?: string
          perf_1d?: number | null
          perf_5d?: number | null
          perf_1m?: number | null
          perf_3m?: number | null
          perf_6m?: number | null
          perf_ytd?: number | null
          perf_1y?: number | null
          perf_3y?: number | null
          perf_5y?: number | null
          perf_10y?: number | null
          perf_max?: number | null
        }
        Relationships: []
      }
      analyst_estimates: {
        Row: {
          id: number
          symbol: string
          estimate_date: string
          period: string
          period_end: string | null
          eps_estimated: number | null
          eps_estimated_low: number | null
          eps_estimated_high: number | null
          eps_estimated_avg: number | null
          number_analysts_eps: number | null
          revenue_estimated: number | null
          revenue_estimated_low: number | null
          revenue_estimated_high: number | null
          revenue_estimated_avg: number | null
          number_analysts_revenue: number | null
          eps_growth_estimated: number | null
          revenue_growth_estimated: number | null
          target_price: number | null
          target_price_low: number | null
          target_price_high: number | null
          analyst_rating_buy: number | null
          analyst_rating_hold: number | null
          analyst_rating_sell: number | null
          analyst_rating_strong_buy: number | null
          analyst_rating_strong_sell: number | null
          created_at: string
        }
        Insert: {
          id?: number
          symbol: string
          estimate_date: string
          period: string
          period_end?: string | null
          eps_estimated?: number | null
          eps_estimated_low?: number | null
          eps_estimated_high?: number | null
          eps_estimated_avg?: number | null
          number_analysts_eps?: number | null
          revenue_estimated?: number | null
          revenue_estimated_low?: number | null
          revenue_estimated_high?: number | null
          revenue_estimated_avg?: number | null
          number_analysts_revenue?: number | null
          eps_growth_estimated?: number | null
          revenue_growth_estimated?: number | null
          target_price?: number | null
          target_price_low?: number | null
          target_price_high?: number | null
          analyst_rating_buy?: number | null
          analyst_rating_hold?: number | null
          analyst_rating_sell?: number | null
          analyst_rating_strong_buy?: number | null
          analyst_rating_strong_sell?: number | null
          created_at?: string
        }
        Update: {
          symbol?: string
          estimate_date?: string
          period?: string
          period_end?: string | null
          eps_estimated?: number | null
          eps_estimated_low?: number | null
          eps_estimated_high?: number | null
          eps_estimated_avg?: number | null
          number_analysts_eps?: number | null
          revenue_estimated?: number | null
          revenue_estimated_low?: number | null
          revenue_estimated_high?: number | null
          revenue_estimated_avg?: number | null
          number_analysts_revenue?: number | null
          target_price?: number | null
          target_price_low?: number | null
          target_price_high?: number | null
        }
        Relationships: []
      }
      earnings_history: {
        Row: {
          id: number
          symbol: string
          fiscal_year: number
          fiscal_quarter: number | null
          period_end: string
          eps_actual: number | null
          eps_estimated: number | null
          eps_surprise: number | null
          eps_surprise_pct: number | null
          revenue_actual: number | null
          revenue_estimated: number | null
          revenue_surprise: number | null
          revenue_surprise_pct: number | null
          earnings_date: string | null
          earnings_time: string | null
          created_at: string
        }
        Insert: {
          id?: number
          symbol: string
          fiscal_year: number
          fiscal_quarter?: number | null
          period_end: string
          eps_actual?: number | null
          eps_estimated?: number | null
          eps_surprise?: number | null
          eps_surprise_pct?: number | null
          revenue_actual?: number | null
          revenue_estimated?: number | null
          revenue_surprise?: number | null
          revenue_surprise_pct?: number | null
          earnings_date?: string | null
          earnings_time?: string | null
          created_at?: string
        }
        Update: {
          symbol?: string
          fiscal_year?: number
          fiscal_quarter?: number | null
          period_end?: string
          eps_actual?: number | null
          eps_estimated?: number | null
          eps_surprise?: number | null
          eps_surprise_pct?: number | null
          revenue_actual?: number | null
          revenue_estimated?: number | null
          revenue_surprise?: number | null
          revenue_surprise_pct?: number | null
          earnings_date?: string | null
          earnings_time?: string | null
        }
        Relationships: []
      }
      technical_indicators: {
        Row: {
          id: number
          symbol: string
          as_of_date: string
          sma_20: number | null
          sma_50: number | null
          sma_200: number | null
          ema_20: number | null
          ema_50: number | null
          rsi_14: number | null
          atr_14: number | null
          volatility_week: number | null
          volatility_month: number | null
          created_at: string
        }
        Insert: {
          id?: number
          symbol: string
          as_of_date: string
          sma_20?: number | null
          sma_50?: number | null
          sma_200?: number | null
          ema_20?: number | null
          ema_50?: number | null
          rsi_14?: number | null
          atr_14?: number | null
          volatility_week?: number | null
          volatility_month?: number | null
          created_at?: string
        }
        Update: {
          symbol?: string
          as_of_date?: string
          sma_20?: number | null
          sma_50?: number | null
          sma_200?: number | null
          ema_20?: number | null
          ema_50?: number | null
          rsi_14?: number | null
          atr_14?: number | null
          volatility_week?: number | null
          volatility_month?: number | null
        }
        Relationships: []
      }
      market_trends_cache: {
        Row: {
          id: string
          bullets: Json
          created_at: string
        }
        Insert: {
          id?: string
          bullets: Json
          created_at?: string
        }
        Update: {
          id?: string
          bullets?: Json
        }
        Relationships: []
      }
      market_movers_cache: {
        Row: {
          id: number
          session_type: string
          direction: string
          data: Json | null
          market_date: string
          fetched_at: string
        }
        Insert: {
          id?: number
          session_type: string
          direction: string
          data?: Json | null
          market_date: string
          fetched_at?: string
        }
        Update: {
          session_type?: string
          direction?: string
          data?: Json | null
          market_date?: string
          fetched_at?: string
        }
        Relationships: []
      }
      calendar_summaries_cache: {
        Row: {
          id: string
          economic_summary: string
          earnings_summary: string
          created_at: string
        }
        Insert: {
          id?: string
          economic_summary: string
          earnings_summary: string
          created_at?: string
        }
        Update: {
          id?: string
          economic_summary?: string
          earnings_summary?: string
        }
        Relationships: []
      }
      market_summary_cache: {
        Row: {
          id: string
          summary: string
          created_at: string
        }
        Insert: {
          id?: string
          summary: string
          created_at?: string
        }
        Update: {
          id?: string
          summary?: string
        }
        Relationships: []
      }
      stock_why_moving_cache: {
        Row: {
          symbol: string
          status: string
          display_text: string | null
          headline: string | null
          summary: string | null
          bullet_points: Json
          sentiment: string | null
          source: string | null
          source_timestamp: string | null
          is_catalyst: boolean | null
          raw_payload: Json | null
          source_url: string
          error_message: string | null
          fetched_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          symbol: string
          status?: string
          display_text?: string | null
          headline?: string | null
          summary?: string | null
          bullet_points?: Json
          sentiment?: string | null
          source?: string | null
          source_timestamp?: string | null
          is_catalyst?: boolean | null
          raw_payload?: Json | null
          source_url: string
          error_message?: string | null
          fetched_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          symbol?: string
          status?: string
          display_text?: string | null
          headline?: string | null
          summary?: string | null
          bullet_points?: Json
          sentiment?: string | null
          source?: string | null
          source_timestamp?: string | null
          is_catalyst?: boolean | null
          raw_payload?: Json | null
          source_url?: string
          error_message?: string | null
          fetched_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      metric_resolutions: {
        Row: {
          id: string
          user_phrase: string
          resolved_to: string | null
          resolution_method: string | null
          fuzzy_match_score: number | null
          fuzzy_match_suggestion: string | null
          user_question: string | null
          timestamp: string
          created_at: string
        }
        Insert: {
          id?: string
          user_phrase: string
          resolved_to?: string | null
          resolution_method?: string | null
          fuzzy_match_score?: number | null
          fuzzy_match_suggestion?: string | null
          user_question?: string | null
          timestamp?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_phrase?: string
          resolved_to?: string | null
          resolution_method?: string | null
          fuzzy_match_score?: number | null
          fuzzy_match_suggestion?: string | null
          user_question?: string | null
          timestamp?: string
        }
        Relationships: []
      }
      us_stocks: {
        Row: {
          id: string
          symbol: string
          name: string
          exchange: string | null
          sector: string | null
          industry: string | null
          market_cap: number | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          symbol: string
          name: string
          exchange?: string | null
          sector?: string | null
          industry?: string | null
          market_cap?: number | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          symbol?: string
          name?: string
          exchange?: string | null
          sector?: string | null
          industry?: string | null
          market_cap?: number | null
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      evaluation_annotations: {
        Row: {
          id: string
          evaluation_file: string
          question_id: number
          action: string | null
          comment: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          evaluation_file: string
          question_id: number
          action?: string | null
          comment?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          evaluation_file?: string
          question_id?: number
          action?: string | null
          comment?: string | null
          updated_at?: string
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
