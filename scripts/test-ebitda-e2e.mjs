/**
 * End-to-end test for EBITDA margin query
 */
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

console.log('🧪 Testing EBITDA margin query end-to-end...\n')

// Step 1: Tool selection
const toolSelectionPrompt = `You are a router. Choose exactly one tool and return ONLY valid JSON: {"tool": string, "args": object}. No prose.

6. getFinancialMetric - GET advanced financial metrics

   Use for 50+ advanced metrics including:
   - Profitability Margins: gross margin, operating margin, net margin, EBIT margin, EBITDA margin, pretax margin

   Examples:
   - "What's Apple's EBITDA margin?" → {"tool":"getFinancialMetric","args":{"metricNames":["EBITDA margin"],"limit":5}}

User question: "What's Apple's EBITDA margin?"`

console.log('1️⃣  Tool Selection...')
const toolResponse = await openai.chat.completions.create({
  model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  messages: [{ role: 'user', content: toolSelectionPrompt }]
})

const toolSelection = JSON.parse(toolResponse.choices[0].message.content)
console.log('   ✅ Tool:', toolSelection.tool)
console.log('   ✅ Args:', JSON.stringify(toolSelection.args))

// Step 2: Fetch EBITDA margin data
console.log('\n2️⃣  Fetching EBITDA margin data...')
const { data, error } = await supabase
  .from('financial_metrics')
  .select('year, metric_value, metric_category')
  .eq('symbol', 'AAPL')
  .eq('metric_name', 'ebitdaMargin')
  .order('year', { ascending: false })
  .limit(5)

if (error) {
  console.error('❌ Error:', error)
  process.exit(1)
}

console.log(`   ✅ Found ${data.length} years of data`)
console.table(data.map(d => ({
  year: d.year,
  'EBITDA Margin': `${(d.metric_value * 100).toFixed(2)}%`
})))

// Step 3: Generate answer
console.log('\n3️⃣  Generating answer...')
const answerPrompt = `You are an analyst. Answer the user using ONLY the provided facts.

User question: "What's Apple's EBITDA margin?"

Facts (JSON rows):
${JSON.stringify(data, null, 2)}

Respond in plain text sentences. When there are 2-4 data points, list them briefly in your answer.`

const answerResponse = await openai.chat.completions.create({
  model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  messages: [{ role: 'user', content: answerPrompt }]
})

const answer = answerResponse.choices[0].message.content
console.log('\n✅ Final Answer:')
console.log('   ' + answer)

console.log('\n🎉 Test complete!')
