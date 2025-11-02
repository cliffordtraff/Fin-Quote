import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

console.log('Checking for recent "gross margin" queries...\n')

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
  console.log('User Question:', query.user_question)
  console.log('Tool Selected:', query.tool_selected)
  console.log('Tool Args:', JSON.stringify(query.tool_args, null, 2))
  console.log('Tool Error:', query.tool_error || 'None')
  console.log('Data Returned:', query.data_row_count, 'rows')
  console.log('\nAnswer Generated:')
  console.log(query.answer_generated)

  if (query.data_returned && query.data_returned.length > 0) {
    console.log('\nData Sample (first 2 rows):')
    console.log(JSON.stringify(query.data_returned.slice(0, 2), null, 2))
  }
} else {
  console.log('No queries found containing "gross"')
}
