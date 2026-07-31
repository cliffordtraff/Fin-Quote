import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto'

const ENCRYPTION_VERSION = 'v1'
const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const KEY_BYTES = 32

function decodeConfiguredKey(value: string): Buffer {
  const trimmed = value.trim()
  const key = /^[0-9a-f]{64}$/i.test(trimmed)
    ? Buffer.from(trimmed, 'hex')
    : Buffer.from(trimmed, 'base64')

  if (key.length !== KEY_BYTES) {
    throw new Error(
      'BEEHIIV_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes',
    )
  }

  return key
}

export function getBeehiivEncryptionKey(): Buffer {
  const configured = process.env.BEEHIIV_TOKEN_ENCRYPTION_KEY
  if (configured?.trim()) {
    return decodeConfiguredKey(configured)
  }

  if (process.env.NODE_ENV !== 'production') {
    const developmentSeed = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (developmentSeed?.trim()) {
      return createHash('sha256')
        .update('fin-quote:beehiiv-oauth:v1:')
        .update(developmentSeed)
        .digest()
    }
  }

  throw new Error('Missing BEEHIIV_TOKEN_ENCRYPTION_KEY')
}

export function encryptBeehiivPayload(
  payload: unknown,
  key = getBeehiivEncryptionKey(),
): string {
  if (key.length !== KEY_BYTES) {
    throw new Error('Beehiiv encryption key must be 32 bytes')
  }

  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8')
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [
    ENCRYPTION_VERSION,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.')
}

export function decryptBeehiivPayload<T>(
  encrypted: string,
  key = getBeehiivEncryptionKey(),
): T {
  if (key.length !== KEY_BYTES) {
    throw new Error('Beehiiv encryption key must be 32 bytes')
  }

  const [version, encodedIv, encodedAuthTag, encodedCiphertext, extra] =
    encrypted.split('.')
  if (
    version !== ENCRYPTION_VERSION ||
    !encodedIv ||
    !encodedAuthTag ||
    !encodedCiphertext ||
    extra
  ) {
    throw new Error('Invalid Beehiiv encrypted payload')
  }

  const iv = Buffer.from(encodedIv, 'base64url')
  const authTag = Buffer.from(encodedAuthTag, 'base64url')
  const ciphertext = Buffer.from(encodedCiphertext, 'base64url')
  if (iv.length !== IV_BYTES || authTag.length !== 16) {
    throw new Error('Invalid Beehiiv encrypted payload')
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ])

  return JSON.parse(plaintext.toString('utf8')) as T
}
