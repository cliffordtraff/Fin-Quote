import OpenAI from 'openai'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const TOOL_SELECTION_PROMPT = `You are a router. Choose exactly one tool and return ONLY valid JSON: {"tool": string, "args": object}. No prose.

Available Tools:

6. getFinancialMetric - GET advanced financial metrics

   Use for 50+ advanced metrics including:
   - Valuation: P/E ratio, P/B ratio, PEG ratio, EV/EBITDA, market cap
   - Profitability Margins: gross margin, operating margin, net margin, EBIT margin, pretax margin
     * Note: EBITDA margin is NOT available. Use EBIT margin (operating margin) instead.
   - Returns: ROE, ROA, ROIC, return on capital employed
   - Leverage: debt-to-equity, current ratio, quick ratio, cash ratio
   - Growth: revenue growth, EPS growth, dividend growth
   - Efficiency: asset turnover, inventory turnover, cash conversion cycle
   - And many more...

   METRIC NAME FLEXIBILITY:
   - Accepts canonical names: "peRatio", "returnOnEquity", "operatingProfitMargin"
   - Accepts common aliases: "P/E", "ROE", "operating margin", "EBIT margin"
   - Can handle multiple metrics in one call

   Examples:
   - "What's Apple's P/E ratio?" → {"tool":"getFinancialMetric","args":{"metricNames":["P/E"],"limit":5}}
   - "Show me operating margin trend" → {"tool":"getFinancialMetric","args":{"metricNames":["operating margin"],"limit":4}}
   - "EBIT margin for last 5 years" → {"tool":"getFinancialMetric","args":{"metricNames":["EBIT margin"],"limit":5}}
   - "What's EBITDA margin?" → {"tool":"getFinancialMetric","args":{"metricNames":["operating margin"],"limit":5}}
     (Note: Map EBITDA margin requests to operating margin/EBIT margin since EBITDA margin is not available)

   args: {"metricNames": ["<metric1>"], "limit": <number>}`

const testQuestions = [
  "What's Apple's EBITDA margin?",
  "Show me EBITDA margin trend",
  "What's the operating margin?",
  "Give me EBIT margin for the last 5 years"
]

console.log('🧪 Testing EBITDA/EBIT margin routing...\n')

for (const question of testQuestions) {
  console.log(`Q: "${question}"`)

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: TOOL_SELECTION_PROMPT },
        { role: 'user', content: `User question: "${question}"` }
      ]
    })

    const response = completion.choices[0].message.content.trim()
    console.log(`A: ${response}`)

    const parsed = JSON.parse(response)
    console.log(`   ✅ Tool: ${parsed.tool}`)
    console.log(`   ✅ Args: ${JSON.stringify(parsed.args)}`)

  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`)
  }

  console.log('')
}

console.log('✅ Test complete!')
