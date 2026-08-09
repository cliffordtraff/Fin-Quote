export function getNewsletterRenderHeaders(): Record<string, string> {
  const apiKey = process.env.NEWSLETTER_RENDER_API_KEY?.trim()
  return {
    Accept: 'image/png',
    'Content-Type': 'application/json',
    ...(apiKey ? { 'X-Newsletter-Render-Key': apiKey } : {}),
  }
}

export async function readBoundedResponseBytes(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error('A positive response byte limit is required')
  }

  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body
      ?.cancel('Response exceeded the byte limit')
      .catch(() => undefined)
    throw new Error('Response exceeded the byte limit')
  }
  if (!response.body) return new Uint8Array()

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value?.byteLength) continue
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel('Response exceeded the byte limit').catch(() => undefined)
        throw new Error('Response exceeded the byte limit')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export interface BoundedResponseText {
  text: string
  truncated: boolean
}

/**
 * Read a diagnostic response without allowing a renderer to make an error
 * path buffer an arbitrary payload. Once the prefix is full, cancel the
 * upstream stream so the server does not continue sending unused bytes.
 */
export async function readBoundedResponseText(
  response: Response,
  maxBytes: number,
): Promise<BoundedResponseText> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error('A positive response byte limit is required')
  }
  if (!response.body) return { text: '', truncated: false }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  let truncated = false
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value?.byteLength) continue

      const remaining = maxBytes - total
      if (remaining === 0) {
        truncated = true
        await reader.cancel('Response diagnostic exceeded the byte limit')
          .catch(() => undefined)
        break
      }
      if (value.byteLength > remaining) {
        chunks.push(value.subarray(0, remaining))
        total += remaining
        truncated = true
        await reader.cancel('Response diagnostic exceeded the byte limit')
          .catch(() => undefined)
        break
      }

      chunks.push(value)
      total += value.byteLength
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  return {
    text: new TextDecoder().decode(bytes),
    truncated,
  }
}
