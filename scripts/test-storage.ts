import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs/promises'
import * as path from 'path'

async function testStorage() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Error: Missing Supabase credentials in .env.local')
    return
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  console.log('Testing Supabase Storage access...\n')

  // Note: Anon key cannot list buckets due to RLS (this is normal security)
  // Instead, we'll test direct access to the "filings" bucket
  console.log('Testing "filings" bucket access...\n')

  // Test 2: Try to upload a test file
  const testContent = '<html><body>Test filing content</body></html>'
  const testPath = 'test/test-filing.html'

  const { error: uploadError } = await supabase.storage
    .from('filings')
    .upload(testPath, testContent, {
      contentType: 'text/html',
      upsert: true,
    })

  if (uploadError) {
    console.error('❌ Error uploading test file:', uploadError.message)
    return
  }

  console.log('✅ Successfully uploaded test file')

  // Test 3: Try to download the test file
  const { data: downloadData, error: downloadError } = await supabase.storage
    .from('filings')
    .download(testPath)

  if (downloadError) {
    console.error('❌ Error downloading test file:', downloadError.message)
    return
  }

  console.log('✅ Successfully downloaded test file')

  // Test 4: Clean up test file
  const { error: deleteError } = await supabase.storage
    .from('filings')
    .remove([testPath])

  if (deleteError) {
    console.error('⚠️  Warning: Could not delete test file:', deleteError.message)
  } else {
    console.log('✅ Successfully deleted test file')
  }

  console.log('\n🎉 Storage is configured correctly and ready for Phase 4!')
}

// Load environment variables from .env.local
async function loadEnv() {
  try {
    const envPath = path.join(process.cwd(), '.env.local')
    const envContent = await fs.readFile(envPath, 'utf-8')

    envContent.split('\n').forEach((line) => {
      const match = line.match(/^([^=:#]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        const value = match[2].trim()
        process.env[key] = value
      }
    })
  } catch (error) {
    console.error('Error loading .env.local:', error)
  }
}

loadEnv().then(() => testStorage()).catch(console.error)
