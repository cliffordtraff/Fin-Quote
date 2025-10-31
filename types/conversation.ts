// Conversation types for chat memory

export type Message = {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export type ConversationHistory = Message[]
