import { describe, expect, it } from 'vitest'
import { comparePostgresTimestamps } from '@/lib/chatbot/timestamp-order'

describe('PostgreSQL timestamp ordering', () => {
  it('preserves microseconds that Date.parse truncates', () => {
    expect(Date.parse('2026-08-09T12:00:00.123457Z')).toBe(
      Date.parse('2026-08-09T12:00:00.123456Z'),
    )
    expect(comparePostgresTimestamps(
      '2026-08-09T12:00:00.123457Z',
      '2026-08-09T12:00:00.123456Z',
    )).toBe(1)
  })

  it('normalizes offsets before comparing fractions', () => {
    expect(comparePostgresTimestamps(
      '2026-08-09T08:00:00.000001-04:00',
      '2026-08-09T12:00:00.000000Z',
    )).toBe(1)
  })
})
