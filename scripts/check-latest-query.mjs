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

async function checkLatestQuery() {
  console.log('Fetching latest queries about risk factors...\n')

  const { data: queries, error } = await supabase
    .from('query_logs')
    .select('*')
    .ilike('user_question', '%risk%')
    .order('created_at', { ascending: false })
    .limit(3)

  if (error) {
    console.error('Error:', error)
    return
  }

  if (!queries || queries.length === 0) {
    console.log('No queries found matching "risk"')
    return
  }

  queries.forEach((query, i) => {
    console.log(`\n${'='.repeat(80)}`)
    console.log(`Query ${i + 1}: ${query.user_question}`)
    console.log('='.repeat(80))
    console.log(`Tool Selected: ${query.tool_selected}`)
    console.log(`Tool Args: ${query.tool_args}`)
    console.log(`\nTool Selection Tokens: prompt=${query.tool_selection_prompt_tokens}, completion=${query.tool_selection_completion_tokens}`)
    console.log(`Answer Generation Tokens: prompt=${query.answer_prompt_tokens}, completion=${query.answer_completion_tokens}`)
    console.log(`\nValidation Passed: ${query.validation_passed}`)

    if (query.data_returned) {
      console.log(`\nData Returned:`)
      const data = typeof query.data_returned === 'string' ? JSON.parse(query.data_returned) : query.data_returned
      if (Array.isArray(data)) {
        console.log(`  Type: Array with ${data.length} items`)
        if (data.length > 0) {
          console.log(`  First item keys: ${Object.keys(data[0]).join(', ')}`)
          if (data[0].chunk_text) {
            console.log(`  First chunk preview: ${data[0].chunk_text.substring(0, 150)}...`)
          }
        }
      } else {
        console.log(`  Type: ${typeof data}`)
        console.log(`  Keys: ${Object.keys(data).join(', ')}`)
      }
    }

    console.log(`\nAnswer Generated:`)
    console.log(query.answer_generated || '(no answer)')

    if (query.validation_results) {
      console.log(`\nValidation Results:`)
      const validation = typeof query.validation_results === 'string'
        ? JSON.parse(query.validation_results)
        : query.validation_results
      console.log(JSON.stringify(validation, null, 2))
    }
  })
}

checkLatestQuery().catch(console.error)
