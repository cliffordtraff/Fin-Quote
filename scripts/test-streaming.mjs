// Test the streaming API endpoint

async function testStreaming() {
  console.log('Testing streaming API...\n')

  try {
    const response = await fetch('http://localhost:3002/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'What is AAPL revenue for 2024?',
        conversationHistory: [],
        sessionId: 'test-session',
      }),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    console.log('Streaming response:\n')

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n\n')

      for (const line of lines) {
        if (!line.trim()) continue

        // Parse SSE format
        const eventMatch = line.match(/event: (\w+)\ndata: (.+)/s)
        if (!eventMatch) continue

        const [, eventType, dataStr] = eventMatch
        const data = JSON.parse(dataStr)

        console.log(`[${eventType}]`, JSON.stringify(data, null, 2))
      }
    }

    console.log('\n✅ Streaming test complete!')
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

testStreaming()
