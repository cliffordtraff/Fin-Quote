import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

console.log('Checking most recent gross margin query...\n')

// Get the most recent query about gross margin
const { data, error } = await supabase
  .from('query_logs')
  .select('*')
  .ilike('user_question', '%gross%')
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

  if (query.data_returned && query.data_returned.length > 0) {
    console.log('\n' + '='.repeat(80))
    console.log('DATA RETURNED (First 3 rows)')
    console.log('='.repeat(80))
    query.data_returned.slice(0, 3).forEach((row, i) => {
      console.log(`Row ${i + 1}:`)
      console.log(`  Year: ${row.year}`)
      console.log(`  Revenue: $${(row.revenue / 1e9).toFixed(1)}B`)
      console.log(`  Gross Profit: $${(row.gross_profit / 1e9).toFixed(1)}B`)
      console.log(`  Gross Margin: ${((row.gross_profit / row.revenue) * 100).toFixed(1)}%`)
    })
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
  console.log('No queries found containing "gross"')
}
