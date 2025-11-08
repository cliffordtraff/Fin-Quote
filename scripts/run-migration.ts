/**
 * Run database migration
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function runMigration() {
  const sql = fs.readFileSync('supabase/migrations/20251107_evaluation_annotations.sql', 'utf-8')

  console.log('Running migration...')

  // Note: Supabase JS client doesn't support raw SQL execution
  // You'll need to run this in Supabase SQL Editor or use a script
  console.log('⚠️  Please run this SQL in Supabase SQL Editor:')
  console.log('\n' + sql)
}

runMigration()
