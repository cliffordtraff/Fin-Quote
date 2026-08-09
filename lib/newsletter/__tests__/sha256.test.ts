import { describe, expect, it } from 'vitest'
import { sha256Hex } from '@/lib/newsletter/sha256'

describe('sha256Hex', () => {
  it.each([
    [
      '',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    ],
    [
      'abc',
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    ],
    [
      '📈 The Intraday',
      'bd88b996bcb2ad1088bd3520eb4e667b862ff88d896c368ab6fb70a4c61df1e1',
    ],
  ])('matches the standard SHA-256 digest for %j', (value, digest) => {
    expect(sha256Hex(value)).toBe(digest)
  })

  it('handles input spanning more than one 512-bit block', () => {
    expect(sha256Hex('a'.repeat(1000))).toBe(
      '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3',
    )
  })
})
