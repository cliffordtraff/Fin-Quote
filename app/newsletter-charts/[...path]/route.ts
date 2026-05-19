export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { existsSync, readFileSync, statSync } from 'fs'
import { extname, resolve } from 'path'
import { NextRequest, NextResponse } from 'next/server'

const OUTPUT_DIR = resolve(process.cwd(), '.newsletter-output')
const LEGACY_DIR = resolve(process.cwd(), 'public/newsletter-charts')

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.html': 'text/html; charset=utf-8',
}

function resolveSafe(baseDir: string, segments: string[]): string | null {
  const candidate = resolve(baseDir, ...segments)
  const rel = candidate.slice(baseDir.length)
  if (!candidate.startsWith(baseDir + '/') && candidate !== baseDir) return null
  if (rel.includes('..')) return null
  return candidate
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params
  if (!segments?.length) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const primary = resolveSafe(OUTPUT_DIR, segments)
  const legacy = resolveSafe(LEGACY_DIR, segments)

  const filePath =
    primary && existsSync(primary) && statSync(primary).isFile()
      ? primary
      : legacy && existsSync(legacy) && statSync(legacy).isFile()
        ? legacy
        : null

  if (!filePath) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const buffer = readFileSync(filePath)
  const contentType =
    CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream'

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=300',
    },
  })
}
