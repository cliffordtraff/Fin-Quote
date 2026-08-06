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
      newsletter_beehiiv_deliveries: {
        Row: {
          id: string
          draft_id: string
          owner_id: string
          publication_id: string
          beehiiv_post_id: string
          title: string
          preview_url: string | null
          editor_url: string
          content_hash: string
          lifecycle_status: string
          lifecycle_applied_status: string | null
          lifecycle_applied_at: string | null
          beehiiv_status: string | null
          scheduled_at: string | null
          published_at: string | null
          web_url: string | null
          stats_json: Json
          last_reconciled_at: string | null
          last_reconcile_error: string | null
          reconcile_lease_token: string | null
          reconcile_lease_expires_at: string | null
          synced_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          draft_id: string
          owner_id: string
          publication_id: string
          beehiiv_post_id: string
          title: string
          preview_url?: string | null
          editor_url: string
          content_hash: string
          lifecycle_status?: string
          lifecycle_applied_status?: string | null
          lifecycle_applied_at?: string | null
          beehiiv_status?: string | null
          scheduled_at?: string | null
          published_at?: string | null
          web_url?: string | null
          stats_json?: Json
          last_reconciled_at?: string | null
          last_reconcile_error?: string | null
          reconcile_lease_token?: string | null
          reconcile_lease_expires_at?: string | null
          synced_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          draft_id?: string
          owner_id?: string
          publication_id?: string
          beehiiv_post_id?: string
          title?: string
          preview_url?: string | null
          editor_url?: string
          content_hash?: string
          lifecycle_status?: string
          lifecycle_applied_status?: string | null
          lifecycle_applied_at?: string | null
          beehiiv_status?: string | null
          scheduled_at?: string | null
          published_at?: string | null
          web_url?: string | null
          stats_json?: Json
          last_reconciled_at?: string | null
          last_reconcile_error?: string | null
          reconcile_lease_token?: string | null
          reconcile_lease_expires_at?: string | null
          synced_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_beehiiv_deliveries_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: true
            referencedRelation: "newsletter_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_beehiiv_sync_operations: {
        Row: {
          draft_id: string
          owner_id: string
          publication_id: string
          operation_kind: string
          operation_key: string
          content_hash: string
          title: string
          sync_state: string
          remote_post_id: string | null
          remote_preview_url: string | null
          remote_editor_url: string | null
          lease_token: string | null
          lease_expires_at: string | null
          attempt_count: number
          last_error: string | null
          started_at: string
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          draft_id: string
          owner_id: string
          publication_id: string
          operation_kind: string
          operation_key: string
          content_hash: string
          title: string
          sync_state?: string
          remote_post_id?: string | null
          remote_preview_url?: string | null
          remote_editor_url?: string | null
          lease_token?: string | null
          lease_expires_at?: string | null
          attempt_count?: number
          last_error?: string | null
          started_at?: string
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          draft_id?: string
          owner_id?: string
          publication_id?: string
          operation_kind?: string
          operation_key?: string
          content_hash?: string
          title?: string
          sync_state?: string
          remote_post_id?: string | null
          remote_preview_url?: string | null
          remote_editor_url?: string | null
          lease_token?: string | null
          lease_expires_at?: string | null
          attempt_count?: number
          last_error?: string | null
          started_at?: string
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_beehiiv_sync_operations_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: true
            referencedRelation: "newsletter_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_draft_events: {
        Row: {
          id: string
          draft_id: string
          owner_id: string | null
          session_id: string
          event_type: string
          from_status: string | null
          to_status: string | null
          beehiiv_url: string | null
          dedupe_key: string | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          draft_id: string
          owner_id?: string | null
          session_id: string
          event_type: string
          from_status?: string | null
          to_status?: string | null
          beehiiv_url?: string | null
          dedupe_key?: string | null
          metadata?: Json
          created_at?: string
        }
        Update: {
          draft_id?: string
          owner_id?: string | null
          session_id?: string
          event_type?: string
          from_status?: string | null
          to_status?: string | null
          beehiiv_url?: string | null
          dedupe_key?: string | null
          metadata?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_draft_events_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "newsletter_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_integrations: {
        Row: {
          owner_id: string
          provider: string
          credentials_ciphertext: string
          publication_id: string | null
          publication_name: string | null
          publication_url: string | null
          connected_at: string
          last_verified_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          owner_id: string
          provider: string
          credentials_ciphertext: string
          publication_id?: string | null
          publication_name?: string | null
          publication_url?: string | null
          connected_at?: string
          last_verified_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          owner_id?: string
          provider?: string
          credentials_ciphertext?: string
          publication_id?: string | null
          publication_name?: string | null
          publication_url?: string | null
          connected_at?: string
          last_verified_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      newsletter_notifications: {
        Row: {
          id: string
          scope_key: string
          owner_id: string | null
          session_id: string
          market_date: string
          notification_type: string
          severity: string
          title: string
          message: string
          action_url: string | null
          metadata_json: Json
          dedupe_key: string
          read_at: string | null
          delivered_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          scope_key: string
          owner_id?: string | null
          session_id: string
          market_date: string
          notification_type: string
          severity?: string
          title: string
          message: string
          action_url?: string | null
          metadata_json?: Json
          dedupe_key: string
          read_at?: string | null
          delivered_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          scope_key?: string
          owner_id?: string | null
          session_id?: string
          market_date?: string
          notification_type?: string
          severity?: string
          title?: string
          message?: string
          action_url?: string | null
          metadata_json?: Json
          dedupe_key?: string
          read_at?: string | null
          delivered_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      newsletter_webhook_outbox: {
        Row: {
          id: string
          event_id: string
          notification_id: string | null
          scope_key: string
          payload_json: Json
          status: string
          attempt_count: number
          next_attempt_at: string
          last_attempt_at: string | null
          last_error: string | null
          delivered_at: string | null
          lease_token: string | null
          lease_expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          notification_id?: string | null
          scope_key: string
          payload_json: Json
          status?: string
          attempt_count?: number
          next_attempt_at?: string
          last_attempt_at?: string | null
          last_error?: string | null
          delivered_at?: string | null
          lease_token?: string | null
          lease_expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          notification_id?: string | null
          scope_key?: string
          payload_json?: Json
          status?: string
          attempt_count?: number
          next_attempt_at?: string
          last_attempt_at?: string | null
          last_error?: string | null
          delivered_at?: string | null
          lease_token?: string | null
          lease_expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_webhook_outbox_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: true
            referencedRelation: "newsletter_notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_drafts: {
        Row: {
          id: string
          owner_id: string | null
          session_id: string
          ticker: string
          status: string
          source_type: string
          source_review_key: string | null
          beehiiv_url: string | null
          published_at: string | null
          subject_line: string
          draft_json: Json
          preview_html: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id?: string | null
          session_id: string
          ticker: string
          status?: string
          source_type?: string
          source_review_key?: string | null
          beehiiv_url?: string | null
          published_at?: string | null
          subject_line: string
          draft_json: Json
          preview_html: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          owner_id?: string | null
          session_id?: string
          ticker?: string
          status?: string
          source_type?: string
          source_review_key?: string | null
          beehiiv_url?: string | null
          published_at?: string | null
          subject_line?: string
          draft_json?: Json
          preview_html?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      newsletter_daily_settings: {
        Row: {
          id: string
          scope_key: string
          owner_id: string | null
          session_id: string
          enabled: boolean
          target_count: number
          timezone: string
          generation_hour: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          scope_key: string
          owner_id?: string | null
          session_id: string
          enabled?: boolean
          target_count?: number
          timezone?: string
          generation_hour?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          scope_key?: string
          owner_id?: string | null
          session_id?: string
          enabled?: boolean
          target_count?: number
          timezone?: string
          generation_hour?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      newsletter_daily_runs: {
        Row: {
          id: string
          scope_key: string
          owner_id: string | null
          session_id: string
          market_date: string
          edition: string
          status: string
          target_count: number
          source_wiim_run_id: string | null
          source_generated_at: string | null
          selected_count: number
          generated_count: number
          ready_count: number
          attention_count: number
          failed_count: number
          error_message: string | null
          metadata_json: Json
          started_at: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          scope_key: string
          owner_id?: string | null
          session_id: string
          market_date: string
          edition?: string
          status?: string
          target_count: number
          source_wiim_run_id?: string | null
          source_generated_at?: string | null
          selected_count?: number
          generated_count?: number
          ready_count?: number
          attention_count?: number
          failed_count?: number
          error_message?: string | null
          metadata_json?: Json
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          scope_key?: string
          owner_id?: string | null
          session_id?: string
          market_date?: string
          edition?: string
          status?: string
          target_count?: number
          source_wiim_run_id?: string | null
          source_generated_at?: string | null
          selected_count?: number
          generated_count?: number
          ready_count?: number
          attention_count?: number
          failed_count?: number
          error_message?: string | null
          metadata_json?: Json
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      newsletter_daily_automation_runs: {
        Row: {
          id: string
          market_date: string
          status: string
          stage: string
          candidate_symbols: string[]
          candidate_count: number
          finviz_completed_count: number
          finviz_found_count: number
          finviz_error_count: number
          summary_completed_count: number
          summary_generated_count: number
          summary_no_result_count: number
          summary_error_count: number
          wiim_run_id: string | null
          newsletter_scope_count: number
          newsletter_completed_scope_count: number
          newsletter_selected_count: number
          newsletter_generated_count: number
          newsletter_ready_count: number
          newsletter_attention_count: number
          newsletter_failed_count: number
          invocation_count: number
          last_error: string | null
          metadata_json: Json
          lease_token: string | null
          lease_expires_at: string | null
          started_at: string | null
          completed_at: string | null
          last_heartbeat_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          market_date: string
          status?: string
          stage?: string
          candidate_symbols?: string[]
          candidate_count?: number
          finviz_completed_count?: number
          finviz_found_count?: number
          finviz_error_count?: number
          summary_completed_count?: number
          summary_generated_count?: number
          summary_no_result_count?: number
          summary_error_count?: number
          wiim_run_id?: string | null
          newsletter_scope_count?: number
          newsletter_completed_scope_count?: number
          newsletter_selected_count?: number
          newsletter_generated_count?: number
          newsletter_ready_count?: number
          newsletter_attention_count?: number
          newsletter_failed_count?: number
          invocation_count?: number
          last_error?: string | null
          metadata_json?: Json
          lease_token?: string | null
          lease_expires_at?: string | null
          started_at?: string | null
          completed_at?: string | null
          last_heartbeat_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          market_date?: string
          status?: string
          stage?: string
          candidate_symbols?: string[]
          candidate_count?: number
          finviz_completed_count?: number
          finviz_found_count?: number
          finviz_error_count?: number
          summary_completed_count?: number
          summary_generated_count?: number
          summary_no_result_count?: number
          summary_error_count?: number
          wiim_run_id?: string | null
          newsletter_scope_count?: number
          newsletter_completed_scope_count?: number
          newsletter_selected_count?: number
          newsletter_generated_count?: number
          newsletter_ready_count?: number
          newsletter_attention_count?: number
          newsletter_failed_count?: number
          invocation_count?: number
          last_error?: string | null
          metadata_json?: Json
          lease_token?: string | null
          lease_expires_at?: string | null
          started_at?: string | null
          completed_at?: string | null
          last_heartbeat_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'newsletter_daily_automation_runs_wiim_run_id_fkey'
            columns: ['wiim_run_id']
            isOneToOne: false
            referencedRelation: 'wiim_runs'
            referencedColumns: ['id']
          },
        ]
      }
      newsletter_mid_morning_runs: {
        Row: {
          id: string
          market_date: string
          status: string
          stage: string
          candidate_symbols: string[]
          candidate_count: number
          finviz_completed_count: number
          finviz_found_count: number
          finviz_error_count: number
          morning_wiim_run_id: string | null
          mid_morning_wiim_run_id: string | null
          summary_completed_count: number
          summary_generated_count: number
          summary_error_count: number
          meaningful_change: boolean | null
          invocation_count: number
          last_error: string | null
          metadata_json: Json
          lease_token: string | null
          lease_expires_at: string | null
          started_at: string | null
          completed_at: string | null
          last_heartbeat_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          market_date: string
          status?: string
          stage?: string
          candidate_symbols?: string[]
          candidate_count?: number
          finviz_completed_count?: number
          finviz_found_count?: number
          finviz_error_count?: number
          morning_wiim_run_id?: string | null
          mid_morning_wiim_run_id?: string | null
          summary_completed_count?: number
          summary_generated_count?: number
          summary_error_count?: number
          meaningful_change?: boolean | null
          invocation_count?: number
          last_error?: string | null
          metadata_json?: Json
          lease_token?: string | null
          lease_expires_at?: string | null
          started_at?: string | null
          completed_at?: string | null
          last_heartbeat_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          market_date?: string
          status?: string
          stage?: string
          candidate_symbols?: string[]
          candidate_count?: number
          finviz_completed_count?: number
          finviz_found_count?: number
          finviz_error_count?: number
          morning_wiim_run_id?: string | null
          mid_morning_wiim_run_id?: string | null
          summary_completed_count?: number
          summary_generated_count?: number
          summary_error_count?: number
          meaningful_change?: boolean | null
          invocation_count?: number
          last_error?: string | null
          metadata_json?: Json
          lease_token?: string | null
          lease_expires_at?: string | null
          started_at?: string | null
          completed_at?: string | null
          last_heartbeat_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'newsletter_mid_morning_runs_morning_wiim_run_id_fkey'
            columns: ['morning_wiim_run_id']
            isOneToOne: false
            referencedRelation: 'wiim_runs'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'newsletter_mid_morning_runs_mid_morning_wiim_run_id_fkey'
            columns: ['mid_morning_wiim_run_id']
            isOneToOne: false
            referencedRelation: 'wiim_runs'
            referencedColumns: ['id']
          },
        ]
      }
      newsletter_daily_run_items: {
        Row: {
          id: string
          run_id: string
          rank: number
          ticker: string
          status: string
          quality_band: string
          relevance_score: number
          confidence_score: number
          candidate_type: string
          state_label: string | null
          move_percent: number | null
          reason_type: string | null
          headline: string
          summary_text: string
          key_fact: string | null
          source_refs_json: Json
          candidate_json: Json
          draft_id: string | null
          draft_status: string | null
          subject_line: string | null
          chart_id: string | null
          chart_image_url: string | null
          error_message: string | null
          retry_count: number
          started_at: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          run_id: string
          rank: number
          ticker: string
          status?: string
          quality_band: string
          relevance_score: number
          confidence_score: number
          candidate_type: string
          state_label?: string | null
          move_percent?: number | null
          reason_type?: string | null
          headline: string
          summary_text: string
          key_fact?: string | null
          source_refs_json?: Json
          candidate_json?: Json
          draft_id?: string | null
          draft_status?: string | null
          subject_line?: string | null
          chart_id?: string | null
          chart_image_url?: string | null
          error_message?: string | null
          retry_count?: number
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          run_id?: string
          rank?: number
          ticker?: string
          status?: string
          quality_band?: string
          relevance_score?: number
          confidence_score?: number
          candidate_type?: string
          state_label?: string | null
          move_percent?: number | null
          reason_type?: string | null
          headline?: string
          summary_text?: string
          key_fact?: string | null
          source_refs_json?: Json
          candidate_json?: Json
          draft_id?: string | null
          draft_status?: string | null
          subject_line?: string | null
          chart_id?: string | null
          chart_image_url?: string | null
          error_message?: string | null
          retry_count?: number
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_why_moving_reviews: {
        Row: {
          id: string
          review_key: string
          symbol: string
          market_date: string
          session: string
          direction: string
          status: string
          notes: string
          reviewer_id: string | null
          reviewed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          review_key: string
          symbol: string
          market_date: string
          session: string
          direction: string
          status?: string
          notes?: string
          reviewer_id?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          review_key?: string
          symbol?: string
          market_date?: string
          session?: string
          direction?: string
          status?: string
          notes?: string
          reviewer_id?: string | null
          reviewed_at?: string | null
          updated_at?: string
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
      wiim_run_candidates: {
        Row: {
          id: string
          wiim_run_id: string
          rank: number
          ticker: string | null
          theme: string | null
          headline: string
          why_it_matters: string
          confidence_score: number
          candidate_type: string
          state_label: string | null
          signals_json: Json
          source_refs_json: Json
          metadata_json: Json
          created_at: string
        }
        Insert: {
          id?: string
          wiim_run_id: string
          rank: number
          ticker?: string | null
          theme?: string | null
          headline: string
          why_it_matters: string
          confidence_score: number
          candidate_type: string
          state_label?: string | null
          signals_json?: Json
          source_refs_json?: Json
          metadata_json?: Json
          created_at?: string
        }
        Update: {
          id?: string
          wiim_run_id?: string
          rank?: number
          ticker?: string | null
          theme?: string | null
          headline?: string
          why_it_matters?: string
          confidence_score?: number
          candidate_type?: string
          state_label?: string | null
          signals_json?: Json
          source_refs_json?: Json
          metadata_json?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'wiim_run_candidates_wiim_run_id_fkey'
            columns: ['wiim_run_id']
            isOneToOne: false
            referencedRelation: 'wiim_runs'
            referencedColumns: ['id']
          },
        ]
      }
      wiim_runs: {
        Row: {
          id: string
          run_type: string
          status: string
          started_at: string
          completed_at: string | null
          summary_text: string | null
          top_candidate: string | null
          best_contrarian_candidate: string | null
          top_five_json: Json | null
          metadata_json: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          run_type: string
          status?: string
          started_at?: string
          completed_at?: string | null
          summary_text?: string | null
          top_candidate?: string | null
          best_contrarian_candidate?: string | null
          top_five_json?: Json | null
          metadata_json?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          run_type?: string
          status?: string
          started_at?: string
          completed_at?: string | null
          summary_text?: string | null
          top_candidate?: string | null
          best_contrarian_candidate?: string | null
          top_five_json?: Json | null
          metadata_json?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      wiim_summary_runs: {
        Row: {
          run_id: string
          run_date: string
          ticker_count: number
          tickers: string[]
          model: string | null
          config_version: string | null
          created_at: string
        }
        Insert: {
          run_id: string
          run_date: string
          ticker_count?: number
          tickers?: string[]
          model?: string | null
          config_version?: string | null
          created_at?: string
        }
        Update: {
          run_id?: string
          run_date?: string
          ticker_count?: number
          tickers?: string[]
          model?: string | null
          config_version?: string | null
          created_at?: string
        }
        Relationships: []
      }
      stock_summaries: {
        Row: {
          id: number
          symbol: string
          summary_date: string
          summary_text: string | null
          model: string | null
          config_version: string | null
          winning_event: Json | null
          runner_up_event: Json | null
          no_summary_reason: string | null
          activation_path: string | null
          earnings_context: Json | null
          generated_at: string
          metadata: Json
          run_id: string | null
          feedback: string | null
          feedback_at: string | null
        }
        Insert: {
          id?: number
          symbol: string
          summary_date: string
          summary_text?: string | null
          model?: string | null
          config_version?: string | null
          winning_event?: Json | null
          runner_up_event?: Json | null
          no_summary_reason?: string | null
          activation_path?: string | null
          earnings_context?: Json | null
          generated_at?: string
          metadata?: Json
          run_id?: string | null
          feedback?: string | null
          feedback_at?: string | null
        }
        Update: {
          id?: number
          symbol?: string
          summary_date?: string
          summary_text?: string | null
          model?: string | null
          config_version?: string | null
          winning_event?: Json | null
          runner_up_event?: Json | null
          no_summary_reason?: string | null
          activation_path?: string | null
          earnings_context?: Json | null
          generated_at?: string
          metadata?: Json
          run_id?: string | null
          feedback?: string | null
          feedback_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {}
    Functions: {
      claim_newsletter_daily_automation: {
        Args: {
          p_market_date: string
          p_lease_token: string
          p_lease_seconds?: number
        }
        Returns: Database['public']['Tables']['newsletter_daily_automation_runs']['Row'][]
      }
      claim_newsletter_mid_morning_automation: {
        Args: {
          p_market_date: string
          p_lease_token: string
          p_lease_seconds?: number
        }
        Returns: Database['public']['Tables']['newsletter_mid_morning_runs']['Row'][]
      }
      claim_newsletter_webhook_outbox: {
        Args: {
          p_lease_token: string
          p_limit?: number
          p_lease_seconds?: number
          p_outbox_id?: string | null
        }
        Returns: Database['public']['Tables']['newsletter_webhook_outbox']['Row'][]
      }
      claim_newsletter_beehiiv_reconciliation: {
        Args: {
          p_lease_token: string
          p_limit?: number
          p_lease_seconds?: number
        }
        Returns: Database['public']['Tables']['newsletter_beehiiv_deliveries']['Row'][]
      }
      claim_newsletter_beehiiv_sync: {
        Args: {
          p_owner_id: string
          p_draft_id: string
          p_publication_id: string
          p_operation_kind: string
          p_operation_key: string
          p_content_hash: string
          p_title: string
          p_lease_token: string
          p_lease_seconds?: number
        }
        Returns: Database['public']['Tables']['newsletter_beehiiv_sync_operations']['Row'][]
      }
      renew_newsletter_beehiiv_reconciliation: {
        Args: {
          p_owner_id: string
          p_draft_id: string
          p_lease_token: string
          p_lease_seconds?: number
        }
        Returns: Database['public']['Tables']['newsletter_beehiiv_deliveries']['Row'][]
      }
      update_newsletter_beehiiv_lifecycle_claim: {
        Args: {
          p_owner_id: string
          p_draft_id: string
          p_post_id: string
          p_lease_token: string
          p_lifecycle_status: string
          p_beehiiv_status: string | null
          p_scheduled_at: string | null
          p_published_at: string | null
          p_web_url: string | null
          p_stats_json: Json
          p_error?: string | null
        }
        Returns: Database['public']['Tables']['newsletter_beehiiv_deliveries']['Row'][]
      }
      mark_newsletter_beehiiv_lifecycle_applied: {
        Args: {
          p_owner_id: string
          p_draft_id: string
          p_lease_token: string
          p_lifecycle_status: string
        }
        Returns: Database['public']['Tables']['newsletter_beehiiv_deliveries']['Row'][]
      }
      record_newsletter_beehiiv_reconcile_error: {
        Args: {
          p_owner_id: string
          p_draft_id: string
          p_lease_token: string
          p_error: string
        }
        Returns: boolean
      }
      complete_newsletter_webhook_attempt: {
        Args: {
          p_outbox_id: string
          p_lease_token: string
          p_delivered: boolean
          p_error: string | null
          p_next_attempt_at: string
        }
        Returns: Database['public']['Tables']['newsletter_webhook_outbox']['Row'][]
      }
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
      release_newsletter_daily_automation: {
        Args: { p_market_date: string; p_lease_token: string }
        Returns: undefined
      }
      release_newsletter_mid_morning_automation: {
        Args: { p_market_date: string; p_lease_token: string }
        Returns: undefined
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
