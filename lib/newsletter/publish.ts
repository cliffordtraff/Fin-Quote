import { readFileSync } from 'fs'
import { basename } from 'path'
import { createClient } from '@supabase/supabase-js'
import {
  describeImmutableNewsletterImage,
  isImmutableAssetAlreadyStored,
} from './immutable-assets'

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
 * Files are content-addressed, immutable, and safe to reference from sent
 * email. A retry with different pixels gets a different URL.
 */
export async function publishChartImages(
  filePaths: string[],
): Promise<Record<string, string>> {
  const supabase = createServiceClient()
  const urlMap: Record<string, string> = {}

  for (const filePath of filePaths) {
    const filename = basename(filePath)
    const fileBuffer = readFileSync(filePath)
    const asset = describeImmutableNewsletterImage(fileBuffer)

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(asset.storagePath, fileBuffer, {
        contentType: asset.contentType,
        cacheControl: asset.cacheControl,
        upsert: false,
        metadata: {
          sha256: asset.digest,
          width: asset.width,
          height: asset.height,
        },
      })

    if (error && !isImmutableAssetAlreadyStored(error)) {
      throw new Error(
        `Failed to upload ${filename} to Supabase Storage: ${error.message}`,
      )
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(asset.storagePath)

    urlMap[filename] = urlData.publicUrl
  }

  return urlMap
}
