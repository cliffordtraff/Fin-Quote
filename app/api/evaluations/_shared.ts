import { NextResponse } from 'next/server'
import { z } from 'zod'
import { AdminAccessError } from '@/lib/auth/admin'

export const MAX_EVALUATION_REQUEST_BYTES = 256 * 1024

export class EvaluationRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'EvaluationRequestError'
  }
}

export async function parseEvaluationRequest<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.startsWith('application/json')) {
    throw new EvaluationRequestError(
      'Content-Type must be application/json.',
      415,
    )
  }

  const contentLength = Number(request.headers.get('content-length'))
  if (
    Number.isFinite(contentLength)
    && contentLength > MAX_EVALUATION_REQUEST_BYTES
  ) {
    throw new EvaluationRequestError('Request body is too large.', 413)
  }

  const reader = request.body?.getReader()
  if (!reader) {
    throw new EvaluationRequestError('Request body must be valid JSON.', 400)
  }

  const decoder = new TextDecoder()
  let totalBytes = 0
  let payload = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    totalBytes += value.byteLength
    if (totalBytes > MAX_EVALUATION_REQUEST_BYTES) {
      await reader.cancel()
      throw new EvaluationRequestError('Request body is too large.', 413)
    }
    payload += decoder.decode(value, { stream: true })
  }
  payload += decoder.decode()

  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    throw new EvaluationRequestError('Request body must be valid JSON.', 400)
  }

  const result = schema.safeParse(parsed)
  if (!result.success) {
    throw new EvaluationRequestError('Invalid evaluation request.', 400)
  }

  return result.data
}

export function evaluationApiErrorResponse(
  error: unknown,
  fallbackMessage: string,
): NextResponse {
  if (error instanceof AdminAccessError) {
    const isUnauthenticated = error.message.toLowerCase().includes('signed in')
    return NextResponse.json(
      {
        error: isUnauthenticated
          ? 'Authentication required.'
          : 'Admin access required.',
      },
      { status: isUnauthenticated ? 401 : 403 },
    )
  }

  if (error instanceof EvaluationRequestError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    )
  }

  console.error(fallbackMessage, error)
  return NextResponse.json({ error: fallbackMessage }, { status: 500 })
}
