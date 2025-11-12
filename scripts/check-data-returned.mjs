import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const { data, error } = await supabase
  .from('query_logs')
  .select('*')
  .ilike('user_question', '%gross%')
  .order('created_at', { ascending: false })
  .limit(1)

if (data && data.length > 0) {
  const query = data[0]
  console.log('Data returned to LLM:')
  console.log(JSON.stringify(query.data_returned, null, 2))
}
