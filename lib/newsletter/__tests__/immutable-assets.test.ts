import { describe, expect, it } from 'vitest'
import {
  describeImmutableNewsletterImage,
  isImmutableAssetAlreadyStored,
} from '../immutable-assets'

function png(width: number, height: number, tail = 0): Buffer {
  const bytes = Buffer.alloc(25)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes)
  bytes.writeUInt32BE(width, 16)
  bytes.writeUInt32BE(height, 20)
  bytes[24] = tail
  return bytes
}

describe('immutable newsletter assets', () => {
  it('uses the image bytes as the permanent storage identity', () => {
    const first = describeImmutableNewsletterImage(png(620, 440, 1))
    const same = describeImmutableNewsletterImage(png(620, 440, 1))
    const changed = describeImmutableNewsletterImage(png(620, 440, 2))

    expect(first).toEqual(same)
    expect(first.digest).not.toBe(changed.digest)
    expect(first.storagePath).toBe(
      `immutable/${first.digest.slice(0, 2)}/${first.digest}.png`,
    )
    expect(first).toMatchObject({ width: 620, height: 440 })
  })

  it('fails closed for non-PNG bytes and tolerates immutable duplicates', () => {
    expect(() => describeImmutableNewsletterImage(Buffer.from('not png'))).toThrow(
      'not a valid PNG',
    )
    expect(
      isImmutableAssetAlreadyStored({ statusCode: 409, message: 'Conflict' }),
    ).toBe(true)
  })
})
