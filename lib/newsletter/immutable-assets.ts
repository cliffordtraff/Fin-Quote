import { createHash } from 'node:crypto'

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

export interface ImmutableNewsletterImage {
  digest: string
  storagePath: string
  contentType: 'image/png'
  width: number
  height: number
  cacheControl: string
}

/**
 * Describe a PNG by its bytes, not its mutable local filename. The resulting
 * storage key can never point at different pixels after an email is sent.
 */
export function describeImmutableNewsletterImage(
  bytes: Buffer,
): ImmutableNewsletterImage {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Newsletter chart is not a valid PNG image.')
  }
  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  if (width < 1 || height < 1 || width > 10_000 || height > 10_000) {
    throw new Error('Newsletter chart has invalid PNG dimensions.')
  }
  const digest = createHash('sha256').update(bytes).digest('hex')
  return {
    digest,
    storagePath: `immutable/${digest.slice(0, 2)}/${digest}.png`,
    contentType: 'image/png',
    width,
    height,
    cacheControl: '31536000',
  }
}

export function isImmutableAssetAlreadyStored(error: {
  message?: string
  statusCode?: string | number
} | null): boolean {
  if (!error) return false
  return (
    Number(error.statusCode) === 409 ||
    /already exists|duplicate|conflict/i.test(error.message ?? '')
  )
}
