import type { NextRequest } from 'next/server'
import {
  getDefaultChartingBaseUrlForHost,
  getDefaultPublicChartingBaseUrlForHost,
} from '@/lib/newsletter/charting-platform-export'

function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null

  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    if (url.username || url.password) return null
    return url.origin
  } catch {
    return null
  }
}

function getConfiguredChartingOrigins(request: NextRequest): Set<string> {
  const host = request.headers.get('host')
  return new Set(
    [
      getDefaultChartingBaseUrlForHost(host),
      getDefaultPublicChartingBaseUrlForHost(host),
    ]
      .map(normalizeOrigin)
      .filter((origin): origin is string => Boolean(origin)),
  )
}

export function isAllowedNewsletterChartOrigin(request: NextRequest): boolean {
  const requestOrigin = request.headers.get('origin')
  if (!requestOrigin) return true

  const allowedOrigins = getConfiguredChartingOrigins(request)
  const sameOrigin = normalizeOrigin(request.nextUrl.origin)
  if (sameOrigin) allowedOrigins.add(sameOrigin)

  const normalizedRequestOrigin = normalizeOrigin(requestOrigin)
  return normalizedRequestOrigin !== null && allowedOrigins.has(normalizedRequestOrigin)
}

export function resolveNewsletterChartBaseUrl(
  request: NextRequest,
  requestedBaseUrl: unknown,
): string {
  const fallback = getDefaultChartingBaseUrlForHost(request.headers.get('host'))
  if (typeof requestedBaseUrl !== 'string' || !requestedBaseUrl.trim()) {
    return fallback
  }

  const requestedOrigin = normalizeOrigin(requestedBaseUrl.trim())
  if (
    requestedOrigin === null ||
    !getConfiguredChartingOrigins(request).has(requestedOrigin)
  ) {
    throw new Error('chartBaseUrl must use a configured charting origin')
  }

  return requestedOrigin
}
