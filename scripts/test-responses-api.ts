import OpenAI from 'openai'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

async function testResponsesAPI() {
  console.log('🧪 Testing Responses API...\n')

  try {
    // Test 1: Simple non-streaming response
    console.log('Test 1: Simple response')
    const response1 = await openai.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      input: [
        {
          role: 'user',
          content: 'Say "Hello from Responses API!"',
        },
      ],
    })

    console.log('\nExtracted content:')
    // Use output_text convenience field
    console.log((response1 as any).output_text)

    // Test 2: JSON mode
    console.log('\n\nTest 2: JSON response')
    const response2 = await openai.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      input: [
        {
          role: 'system',
          content: 'Return ONLY valid JSON matching {"tool": string, "args": object}.',
        },
        {
          role: 'user',
          content: 'Pick the tool "getAaplFinancialsByMetric" with args {"metric": "revenue", "limit": 4}',
        },
      ],
      text: { format: { type: 'json_object' } },
    })

    console.log('\nExtracted content:')
    const jsonText = (response2 as any).output_text
    console.log(jsonText)
    const parsed = JSON.parse(jsonText)
    console.log('Parsed:', parsed)

    // Test 3: Streaming
    console.log('\n\nTest 3: Streaming response')
    const stream = await openai.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      input: [
        {
          role: 'user',
          content: 'Count from 1 to 5',
        },
      ],
      stream: true,
    })

    console.log('Stream chunks:')
    let fullText = ''
    let chunkCount = 0
    for await (const chunk of stream) {
      chunkCount++
      console.log(`\n--- Chunk ${chunkCount} ---`)
      console.log(JSON.stringify(chunk, null, 2).substring(0, 500))

      // Try to extract text from chunk
      // The Responses API might use 'delta' or direct fields
      const delta = (chunk as any).delta
      const text = (chunk as any).text || delta?.text || delta?.output_text

      if (text) {
        process.stdout.write(text)
        fullText += text
      }
    }
    console.log('\n\nFull streamed text:', fullText)

    console.log('\n✅ All tests passed!')
  } catch (error) {
    console.error('❌ Test failed:', error)
    if (error instanceof Error) {
      console.error('Error message:', error.message)
      console.error('Error stack:', error.stack)
    }
  }
}

testResponsesAPI()
