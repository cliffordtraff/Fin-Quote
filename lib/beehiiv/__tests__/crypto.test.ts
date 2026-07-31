import { describe, expect, it } from 'vitest'
import {
  decryptBeehiivPayload,
  encryptBeehiivPayload,
} from '@/lib/beehiiv/crypto'

const TEST_KEY = Buffer.alloc(32, 7)

describe('Beehiiv credential encryption', () => {
  it('round-trips structured OAuth credentials', () => {
    const payload = {
      redirectUri: 'https://www.theintraday.com/api/integrations/beehiiv/callback',
      clientInformation: {
        client_id: 'client-id',
        client_secret: 'client-secret',
      },
      tokens: {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        token_type: 'Bearer',
      },
    }

    const encrypted = encryptBeehiivPayload(payload, TEST_KEY)

    expect(encrypted).not.toContain('access-token')
    expect(decryptBeehiivPayload(encrypted, TEST_KEY)).toEqual(payload)
  })

  it('rejects a modified ciphertext', () => {
    const encrypted = encryptBeehiivPayload({ token: 'secret' }, TEST_KEY)
    const lastCharacter = encrypted.at(-1)
    const tampered = `${encrypted.slice(0, -1)}${lastCharacter === 'A' ? 'B' : 'A'}`

    expect(() => decryptBeehiivPayload(tampered, TEST_KEY)).toThrow()
  })
})
