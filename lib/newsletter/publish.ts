import { readFileSync } from 'fs'
import { basename } from 'path'
import { createClient } from '@supabase/supabase-js'

/**
 * Create a Supabase client with the service role key (bypasses RLS).
 * Storage uploads require elevated permissions that the anon key doesn't have.
 */
function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    )
  }
  return createClient(url, key)
}

const BUCKET = 'newsletter-charts'

/**
 * Upload chart PNGs to Supabase Storage and return a map of
 * { localFilename → publicUrl }.
 *
 * Files are stored under a date prefix so each day's run gets its own
 * folder (e.g. `2026-03-12/AAPL_revenue_vs_net_income_20260312.png`).
 *
 * Uses `upsert: true` so re-runs safely overwrite previous uploads.
 */
export async function publishChartImages(
  filePaths: string[],
): Promise<Record<string, string>> {
  const supabase = createServiceClient()
  const datePrefix = new Date().toISOString().slice(0, 10) // e.g. '2026-03-12'
  const urlMap: Record<string, string> = {}

  for (const filePath of filePaths) {
    const filename = basename(filePath)
    const storagePath = `${datePrefix}/${filename}`

    const fileBuffer = readFileSync(filePath)

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: 'image/png',
        upsert: true,
      })

    if (error) {
      throw new Error(
        `Failed to upload ${filename} to Supabase Storage: ${error.message}`,
      )
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(storagePath)

    urlMap[filename] = urlData.publicUrl
  }

  return urlMap
}
