import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

console.log('Checking most recent iPhone query...\n')

// Get the most recent query about iPhone
const { data, error } = await supabase
  .from('query_logs')
  .select('*')
  .ilike('user_question', '%iphone%')
  .order('created_at', { ascending: false })
  .limit(1)

if (error) {
  console.error('Error:', error)
} else if (data && data.length > 0) {
  const query = data[0]
  console.log('='.repeat(80))
  console.log('QUERY DETAILS')
  console.log('='.repeat(80))
  console.log('User Question:', query.user_question)
  console.log('Created At:', query.created_at)
  console.log('Tool Selected:', query.tool_selected)
  console.log('Tool Args:', JSON.stringify(query.tool_args, null, 2))
  console.log('Data Row Count:', query.data_row_count)

  console.log('\n' + '='.repeat(80))
  console.log('ANSWER')
  console.log('='.repeat(80))
  console.log(query.answer_generated)

  if (query.data_returned) {
    console.log('\n' + '='.repeat(80))
    console.log('DATA RETURNED')
    console.log('='.repeat(80))

    const data = query.data_returned
    let passages = []

    if (data.type === 'passages' && data.data) {
      passages = data.data
    } else if (Array.isArray(data)) {
      passages = data
    }

    if (passages.length > 0) {
      console.log(`Total passages: ${passages.length}\n`)
      passages.forEach((passage, i) => {
        console.log(`--- Passage ${i + 1} ---`)
        console.log(`Filing: ${passage.filing_type} (${passage.filing_date})`)
        console.log(`Fiscal Year: ${passage.fiscal_year}${passage.fiscal_quarter ? ' Q' + passage.fiscal_quarter : ''}`)
        console.log(`Section: ${passage.section_name}`)
        console.log(`Text: ${passage.chunk_text}`)
        console.log('')
      })
    } else {
      console.log('No passages found')
    }
  }

  if (query.validation_results) {
    console.log('\n' + '='.repeat(80))
    console.log('VALIDATION RESULTS')
    console.log('='.repeat(80))
    console.log('Overall Passed:', query.validation_passed)
    console.log('Overall Severity:', query.validation_results.overall_severity)

    console.log('\nNumber Validation:', query.validation_results.number_validation?.status || 'N/A')
    if (query.validation_results.number_validation?.details) {
      console.log('  Details:', query.validation_results.number_validation.details)
    }

    console.log('Year Validation:', query.validation_results.year_validation?.status || 'N/A')
    if (query.validation_results.year_validation?.details) {
      console.log('  Details:', query.validation_results.year_validation.details)
    }

    console.log('Filing Validation:', query.validation_results.filing_validation?.status || 'N/A')

    if (query.validation_results.regeneration?.triggered) {
      console.log('\n' + '='.repeat(80))
      console.log('REGENERATION ATTEMPTED')
      console.log('='.repeat(80))
      console.log('Reason:', query.validation_results.regeneration.reason)
      console.log('Second Attempt Passed:', query.validation_results.regeneration.second_attempt_passed)
      if (query.validation_results.regeneration.first_attempt_answer) {
        console.log('First Attempt Answer:', query.validation_results.regeneration.first_attempt_answer)
      }
    } else {
      console.log('\nRegeneration: NOT TRIGGERED')
    }
  } else {
    console.log('\nNo validation results found.')
  }
} else {
  console.log('No queries found containing "iphone"')
}
