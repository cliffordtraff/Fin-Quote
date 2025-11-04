'use client'

import { useLocalRuntime, AssistantRuntimeProvider, Thread } from '@assistant-ui/react'
import { makeMarkdownText } from '@assistant-ui/react-markdown'
import { useState, useEffect } from 'react'
import type { ConversationHistory } from '@/types/conversation'

const MarkdownText = makeMarkdownText()

type AssistantChatProps = {
  conversationHistory: ConversationHistory
  sessionId: string
  onNewMessage?: (userMessage: string, assistantMessage: string) => void
}

export default function AssistantChat({
  conversationHistory,
  sessionId,
  onNewMessage
}: AssistantChatProps) {
  // Create a local runtime that handles our streaming API
  const runtime = useLocalRuntime({
    async onNew({ messages }) {
      const lastMessage = messages[messages.length - 1]
      if (!lastMessage || lastMessage.role !== 'user') return

      try {
        const response = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: lastMessage.content[0].text,
            conversationHistory,
            sessionId,
          }),
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const reader = response.body?.getReader()
        const decoder = new TextDecoder()

        if (!reader) {
          throw new Error('No response body')
        }

        let streamedAnswer = ''
        let accumulatedChunk = ''

        while (true) {
          const { done, value } = await reader.read()

          if (done) {
            // Process any remaining data
            if (accumulatedChunk.trim()) {
              processChunk(accumulatedChunk)
            }
            break
          }

          const chunk = decoder.decode(value, { stream: true })
          accumulatedChunk += chunk

          // Process complete events
          const events = accumulatedChunk.split('\n\n')
          accumulatedChunk = events.pop() || '' // Keep incomplete event

          for (const event of events) {
            processChunk(event)
          }
        }

        function processChunk(eventText: string) {
          if (!eventText.trim()) return

          const eventMatch = eventText.match(/event: (\w+)\ndata: (.+)/)
          if (!eventMatch) return

          const [, eventType, dataStr] = eventMatch

          try {
            const data = JSON.parse(dataStr)

            if (eventType === 'answer') {
              streamedAnswer += data.content
              // Append to the assistant's message in the thread
              runtime.append({
                role: 'assistant',
                content: [{ type: 'text', text: streamedAnswer }],
              })
            }
          } catch (e) {
            console.error('Failed to parse event data:', e)
          }
        }

        // Notify parent if callback provided
        if (onNewMessage && streamedAnswer) {
          onNewMessage(lastMessage.content[0].text, streamedAnswer)
        }
      } catch (error) {
        console.error('Error streaming response:', error)
        // Append error message
        runtime.append({
          role: 'assistant',
          content: [{ type: 'text', text: 'Sorry, an error occurred while processing your request.' }],
        })
      }
    },
  })

  // Initialize with conversation history
  useEffect(() => {
    if (conversationHistory.length > 0) {
      conversationHistory.forEach((msg) => {
        runtime.append({
          role: msg.role as 'user' | 'assistant',
          content: [{ type: 'text', text: msg.content }],
        })
      })
    }
  }, []) // Only run once on mount

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="w-full h-[600px] border border-gray-300 rounded-lg overflow-hidden">
        <Thread
          assistantMessage={{ components: { Text: MarkdownText } }}
        />
      </div>
    </AssistantRuntimeProvider>
  )
}
