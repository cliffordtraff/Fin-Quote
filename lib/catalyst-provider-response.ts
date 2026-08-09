import 'server-only'

/** Parse a provider response without buffering an unbounded JSON document. */
export async function readBoundedProviderJson(
  response: Response,
  maxBytes: number,
): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error('A positive provider response byte limit is required')
  }

  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel('Provider response exceeded the byte limit').catch(() => undefined)
    throw new Error('Provider response exceeded the byte limit')
  }
  if (!response.body) throw new Error('Provider response body was empty')

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
        await reader.cancel('Provider response exceeded the byte limit').catch(() => undefined)
        throw new Error('Provider response exceeded the byte limit')
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

  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
}
