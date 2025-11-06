// Conversation types for chat memory

import type { ChartConfig } from './chart'

export type Message = {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  chartConfig?: ChartConfig | null
  followUpQuestions?: string[]
  dataUsed?: {
    type: 'financials' | 'prices' | 'filings' | 'passages' | 'metrics_catalog' | 'financial_metrics'
    data: any[]
  } | null
}

export type ConversationHistory = Message[]
