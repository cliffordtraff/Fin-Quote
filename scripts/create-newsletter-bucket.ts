/**
 * One-time setup: create a PUBLIC "newsletter-charts" bucket in Supabase Storage.
 *
 * Public because email clients need to fetch images via plain URLs
 * (no auth headers).
 *
 * Usage:
 *   npx tsx scripts/create-newsletter-bucket.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs/promises'
import * as path from 'path'

async function createBucket() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Error: Missing Supabase credentials')
    return
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  console.log('Attempting to create "newsletter-charts" bucket...\n')

  const { data, error } = await supabase.storage.createBucket(
    'newsletter-charts',
    {
      public: true,
      fileSizeLimit: 5242880, // 5MB
      allowedMimeTypes: ['image/png'],
    },
  )

  if (error) {
    if (error.message.includes('already exists')) {
      console.log('Bucket "newsletter-charts" already exists')
    } else {
      console.error('Error creating bucket:', error.message)
      console.log('\nPlease create it manually in Supabase dashboard:')
      console.log(
        '   Storage > New bucket > Name: "newsletter-charts" > Public: ON',
      )
      console.log('   File size limit: 5MB, Allowed MIME types: image/png')
    }
  } else {
    console.log('Successfully created bucket "newsletter-charts"')
    console.log('Data:', data)
  }
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

loadEnv()
  .then(() => createBucket())
  .catch(console.error)
