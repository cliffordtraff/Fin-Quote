const RFC3339_TIMESTAMP_PATTERN =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:)(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/

function timestampToEpochMicroseconds(value: string): bigint | null {
  const match = RFC3339_TIMESTAMP_PATTERN.exec(value)
  if (!match) return null
  const wholeSecondMilliseconds = Date.parse(
    `${match[1]}${match[2]}${match[4]}`,
  )
  if (!Number.isFinite(wholeSecondMilliseconds)) return null
  const micros = (match[3] ?? '').slice(0, 6).padEnd(6, '0')
  return BigInt(wholeSecondMilliseconds) * BigInt(1_000) + BigInt(micros || '0')
}

/** Compare PostgreSQL timestamps without dropping sub-millisecond precision. */
export function comparePostgresTimestamps(left: string, right: string): number {
  const leftMicros = timestampToEpochMicroseconds(left)
  const rightMicros = timestampToEpochMicroseconds(right)
  if (leftMicros === null || rightMicros === null) {
    throw new Error('Invalid PostgreSQL timestamp.')
  }
  return leftMicros < rightMicros ? -1 : leftMicros > rightMicros ? 1 : 0
}
