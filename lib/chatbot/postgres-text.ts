/** PostgreSQL text/jsonb reject U+0000 and malformed UTF-16 surrogate pairs. */
export function isPostgresSafeText(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit === 0) return false
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false
      index += 1
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false
    }
  }
  return true
}

/** Keeps streamed/displayed text identical to the PostgreSQL-safe persisted text. */
export function replaceInvalidPostgresText(value: string): string {
  let result = ''
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit === 0) {
      result += '\ufffd'
    } else if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        result += value[index] + value[index + 1]
        index += 1
      } else {
        result += '\ufffd'
      }
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      result += '\ufffd'
    } else {
      result += value[index]
    }
  }
  return result
}
