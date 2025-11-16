import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkQuery() {
  console.log('Fetching queries about "risk factors" in "10k"...\n')

  const { data: queries, error } = await supabase
    .from('query_logs')
    .select('*')
    .ilike('user_question', '%risk%10k%')
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) {
    console.error('Error:', error)
    return
  }

  if (!queries || queries.length === 0) {
    console.log('No exact match. Checking for any recent "risk" queries...\n')

    const { data: riskQueries, error: riskError } = await supabase
      .from('query_logs')
      .select('*')
      .ilike('user_question', '%risk%')
      .order('created_at', { ascending: false })
      .limit(3)

    if (riskError) {
      console.error('Error:', riskError)
      return
    }

    if (!riskQueries || riskQueries.length === 0) {
      console.log('No risk queries found')
      return
    }

    queries.push(...riskQueries)
  }

  queries.forEach((query, i) => {
    console.log(`\n${'='.repeat(80)}`)
    console.log(`Query ${i + 1}: ${query.user_question}`)
    console.log('='.repeat(80))
    console.log(`Tool Selected: ${query.tool_selected}`)

    if (query.tool_args) {
      const args = typeof query.tool_args === 'string' ? JSON.parse(query.tool_args) : query.tool_args
      console.log(`Tool Args: ${JSON.stringify(args, null, 2)}`)
    }

    if (query.data_returned) {
      console.log(`\nData Type: ${query.data_returned?.type || 'unknown'}`)
      const data = typeof query.data_returned === 'string' ? JSON.parse(query.data_returned) : query.data_returned

      if (Array.isArray(data)) {
        console.log(`Number of items: ${data.length}`)
        if (data.length > 0) {
          console.log(`\nFirst item:`)
          console.log(`  Filing Type: ${data[0].filing_type || 'N/A'}`)
          console.log(`  Filing Date: ${data[0].filing_date || 'N/A'}`)
          console.log(`  Fiscal Year: ${data[0].fiscal_year || 'N/A'}`)
          console.log(`  Section: ${data[0].section_name || 'N/A'}`)
          if (data[0].chunk_text) {
            console.log(`  Text Preview: ${data[0].chunk_text.substring(0, 200)}...`)
          }
        }
      } else if (data.type === 'passages' && data.data) {
        console.log(`Number of passages: ${data.data.length}`)
        if (data.data.length > 0) {
          console.log(`\nFirst passage:`)
          console.log(`  Filing Type: ${data.data[0].filing_type || 'N/A'}`)
          console.log(`  Filing Date: ${data.data[0].filing_date || 'N/A'}`)
          console.log(`  Fiscal Year: ${data.data[0].fiscal_year || 'N/A'}`)
          console.log(`  Section: ${data.data[0].section_name || 'N/A'}`)
          if (data.data[0].chunk_text) {
            console.log(`  Text Preview: ${data.data[0].chunk_text.substring(0, 200)}...`)
          }
        }
      }
    } else {
      console.log('\nNo data returned')
    }

    console.log(`\nAnswer Generated:`)
    console.log(query.answer_generated || '(no answer)')
  })
}

checkQuery().catch(console.error)
