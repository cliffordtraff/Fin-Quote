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
  onNewMessage,
}: AssistantChatProps) {
  // Create a local runtime that handles our streaming API
  const runtime = useLocalRuntime({
    async onNew({ messages }: { messages: Array<{ role: string; content: Array<{ text: string }> }> }) {
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
        let currentStatus = ''
        const completedSteps: string[] = []
        let isAnswering = false

        const updateDisplay = () => {
          let message = ''

          // Show completed steps
          if (completedSteps.length > 0) {
            message = completedSteps.join('\n') + '\n\n'
          }

          // Show current status if we haven't started answering
          if (!isAnswering && currentStatus) {
            message += `*${currentStatus}*`
          }

          // Show answer if we've started
          if (isAnswering && streamedAnswer) {
            message += '---\n\n' + streamedAnswer
          }

          if (message) {
            runtime.append({
              role: 'assistant',
              content: [{ type: 'text', text: message }],
            })
          }
        }

        const processChunk = (eventText: string) => {
          if (!eventText.trim()) return

          const eventMatch = eventText.match(/event: (\w+)\ndata: (.+)/)
          if (!eventMatch) return

          const [, eventType, dataStr] = eventMatch

          try {
            const data = JSON.parse(dataStr)

            if (eventType === 'flow') {
              const step = data.step
              const status = data.status
              const summary = data.summary || ''

              if (status === 'active') {
                // Update current status for active steps
                if (step === 'tool_selection') {
                  currentStatus = '🔍 Analyzing question and selecting tool...'
                } else if (step === 'tool_execution') {
                  currentStatus = `📊 ${summary}...`
                } else if (step === 'chart_generation') {
                  currentStatus = `📈 ${summary}...`
                } else if (step === 'answer_generation') {
                  currentStatus = '✍️ Generating answer from fetched data...'
                } else if (step === 'validation') {
                  currentStatus = '🔎 Validating answer accuracy...'
                } else if (step === 'followup_generation') {
                  currentStatus = '💡 Generating follow-up suggestions...'
                }
                updateDisplay()
              } else if (status === 'success') {
                // Add to completed steps
                const icon = '✓'
                completedSteps.push(`${icon} ${summary}`)
                currentStatus = ''
                updateDisplay()
              } else if (status === 'warning') {
                // Add warning to completed steps
                completedSteps.push(`⚠️ ${summary}`)
                currentStatus = ''
                updateDisplay()
              }
            } else if (eventType === 'answer') {
              isAnswering = true
              streamedAnswer += data.content ?? ''
              currentStatus = ''
              updateDisplay()
            }
          } catch (e) {
            console.error('Failed to parse event data:', e)
          }
        }

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
