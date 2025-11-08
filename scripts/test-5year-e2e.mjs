// End-to-end test for 5-year price range through tool selection
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import OpenAI from 'openai'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load .env.local
dotenv.config({ path: resolve(__dirname, '../.env.local') })

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Simplified tool menu
const TOOL_MENU = `You must select ONE tool to answer the user's question.

Available tools:

1. getAaplFinancialsByMetric - Get financial metrics (revenue, profit, etc.)
   args: {"metric": "<metric_name>", "limit": <number>}

2. getPrices - Stock PRICE history

   TWO MODES:
   A) Preset Ranges (use for common timeframes)
   B) Custom Dates (use for specific date ranges)

   MODE A: PRESET RANGES
   - 7d, 30d, 90d, 365d, ytd
   - 3y, 5y, 10y, 20y (multi-year ranges)
   - max (all available data)

   MAPPING GUIDE:
   Multi-Year:
   - "3 years", "past 3 years", "last 3 years" → 3y
   - "5 years", "5 year history", "past 5 years" → 5y
   - "10 years", "decade", "past decade" → 10y
   - "20 years", "two decades" → 20y

   MODE B: CUSTOM DATES
   - "from Jan 2020 to June 2023" → {"from": "2020-01-01", "to": "2023-06-30"}

   args: {"range": "<preset>"} OR {"from": "<YYYY-MM-DD>", "to": "<YYYY-MM-DD>"}

3. getRecentFilings - LIST SEC filings metadata
   args: {"limit": <number 1-10>}

4. searchFilings - SEARCH filing content
   args: {"query": "<keywords>", "limit": 5}

You MUST respond with ONLY valid JSON:
{
  "tool": "<tool_name>",
  "args": {...}
}`

async function testToolSelection(question) {
  console.log(`\n🧪 Testing: "${question}"`)

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-5-nano',
    messages: [
      {
        role: 'system',
        content: TOOL_MENU,
      },
      {
        role: 'user',
        content: question,
      },
    ],
  })

  const response = completion.choices[0].message.content
  console.log(`   Raw response: ${response}`)

  try {
    const toolSelection = JSON.parse(response)
    console.log(`   ✅ Tool: ${toolSelection.tool}`)
    console.log(`   ✅ Args: ${JSON.stringify(toolSelection.args)}`)
    return toolSelection
  } catch (error) {
    console.error(`   ❌ Failed to parse JSON: ${error.message}`)
    return null
  }
}

// Run tests
console.log('🚀 Testing tool selection for new price ranges\n')
console.log('='.repeat(60))

// Test the original Q19
const result1 = await testToolSelection('Get 5 year stock price history')

// Test variations
const result2 = await testToolSelection('Show me Apple stock prices for the past 5 years')
const result3 = await testToolSelection('What is the 10 year stock performance?')
const result4 = await testToolSelection('Give me prices from 2020 to 2023')
const result5 = await testToolSelection('Show me all time stock history')

console.log('\n' + '='.repeat(60))
console.log('✅ Tool selection tests complete!')

// Validate Q19 specifically
if (result1 && result1.tool === 'getPrices' && result1.args.range === '5y') {
  console.log('\n🎉 Q19 will now PASS! Expected: {"range": "5y"}, Got: {"range": "5y"}')
} else {
  console.log('\n⚠️  Q19 may still fail. Check tool selection above.')
}
