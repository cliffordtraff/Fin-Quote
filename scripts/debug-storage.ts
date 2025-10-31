import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs/promises'
import * as path from 'path'

async function debugStorage() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  console.log('Supabase URL:', SUPABASE_URL)
  console.log('Has anon key:', !!SUPABASE_ANON_KEY)

  const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!)

  const { data, error } = await supabase.storage.listBuckets()

  console.log('\nRaw response:')
  console.log('Data:', JSON.stringify(data, null, 2))
  console.log('Error:', JSON.stringify(error, null, 2))
}

async function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.local')
  const envContent = await fs.readFile(envPath, 'utf-8')
  envContent.split('\n').forEach((line) => {
    const match = line.match(/^([^=:#]+)=(.*)$/)
    if (match) {
      process.env[match[1].trim()] = match[2].trim()
    }
  })
}

loadEnv().then(() => debugStorage()).catch(console.error)
