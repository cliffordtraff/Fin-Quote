// Conversation types for chat memory

import type { ChartConfig } from './chart'

export type Message = {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  chartConfig?: ChartConfig | null
  followUpQuestions?: string[]
}

export type ConversationHistory = Message[]
