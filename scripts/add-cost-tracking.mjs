#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function runMigration() {
  console.log('Running cost tracking migration...')

  const sqlPath = path.join(__dirname, '../data/add-cost-tracking.sql')
  const sql = fs.readFileSync(sqlPath, 'utf8')

  // Split by semicolons and run each statement
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'))

  for (const statement of statements) {
    try {
      const { error } = await supabase.rpc('exec_sql', { sql_query: statement })
      if (error) {
        console.error('Error executing statement:', error)
        console.error('Statement:', statement)
      } else {
        console.log('✓ Executed statement')
      }
    } catch (err) {
      console.error('Error:', err)
    }
  }

  console.log('Migration complete!')
}

runMigration()
