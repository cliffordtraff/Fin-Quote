import { NextResponse, NextRequest } from 'next/server'
import fs from 'fs/promises'
import path from 'path'
import { z } from 'zod'
import { AdminAccessError, requireAdminUser } from '@/lib/auth/admin'

export type Annotation = {
  question_id: number
  action: 'fix_bug' | 'update_golden_test' | 'add_alias' | 'update_prompt' | 'skip' | ''
  comment: string
  updated_at: string
}

export type AnnotationsFile = {
  evaluation_file: string
  timestamp: string
  annotations: Annotation[]
}

const evaluationFileSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(
    /^eval-(?:fast|full)-[A-Za-z0-9._-]+\.json$/,
    'Invalid evaluation file',
  )

const annotationSchema = z.object({
  question_id: z.number().int().nonnegative(),
  action: z.enum([
    'fix_bug',
    'update_golden_test',
    'add_alias',
    'update_prompt',
    'skip',
    '',
  ]),
  comment: z.string().max(4_000),
  updated_at: z.string().max(80),
})

const annotationsFileSchema = z.object({
  evaluation_file: evaluationFileSchema,
  timestamp: z.string().max(80),
  annotations: z.array(annotationSchema).max(2_000),
})

function getAnnotationsPath(evaluationFile: string): string {
  const safeFile = evaluationFileSchema.parse(evaluationFile)
  const annotationsFile = `${safeFile.slice(0, -'.json'.length)}-annotations.json`
  const resultsDirectory = path.resolve(process.cwd(), 'test-data', 'test-results')
  const resolvedPath = path.resolve(resultsDirectory, annotationsFile)

  if (!resolvedPath.startsWith(`${resultsDirectory}${path.sep}`)) {
    throw new Error('Invalid evaluation file')
  }

  return resolvedPath
}

function adminErrorResponse(error: AdminAccessError): NextResponse {
  const signedOut = error.message.includes('signed in')
  return NextResponse.json(
    { error: error.message },
    { status: signedOut ? 401 : 403 },
  )
}

// GET /api/annotations?file=eval-fast-2025-11-07.json
export async function GET(request: NextRequest) {
  try {
    await requireAdminUser()
    const searchParams = request.nextUrl.searchParams
    const evaluationFile = searchParams.get('file')

    if (!evaluationFile) {
      return NextResponse.json({ error: 'Missing file parameter' }, { status: 400 })
    }

    const parsedFile = evaluationFileSchema.safeParse(evaluationFile)
    if (!parsedFile.success) {
      return NextResponse.json({ error: 'Invalid file parameter' }, { status: 400 })
    }

    const annotationsPath = getAnnotationsPath(parsedFile.data)

    // If annotations file doesn't exist, return empty
    try {
      await fs.access(annotationsPath)
    } catch {
      return NextResponse.json({
        evaluation_file: parsedFile.data,
        timestamp: new Date().toISOString(),
        annotations: [],
      })
    }

    const fileContents = await fs.readFile(annotationsPath, 'utf-8')
    const annotations: AnnotationsFile = JSON.parse(fileContents)

    return NextResponse.json(annotations)
  } catch (error) {
    if (error instanceof AdminAccessError) return adminErrorResponse(error)
    console.error('Error reading annotations:', error)
    return NextResponse.json({ error: 'Failed to read annotations' }, { status: 500 })
  }
}

// POST /api/annotations
export async function POST(request: NextRequest) {
  try {
    await requireAdminUser()
    const parsedBody = annotationsFileSchema.safeParse(await request.json())
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: parsedBody.error.issues[0]?.message ?? 'Invalid annotations' },
        { status: 400 },
      )
    }

    const body: AnnotationsFile = parsedBody.data
    const annotationsPath = getAnnotationsPath(body.evaluation_file)

    // Update timestamp
    body.timestamp = new Date().toISOString()

    // Write to file
    await fs.writeFile(annotationsPath, JSON.stringify(body, null, 2), 'utf-8')

    return NextResponse.json(body)
  } catch (error) {
    if (error instanceof AdminAccessError) return adminErrorResponse(error)
    console.error('Error saving annotations:', error)
    return NextResponse.json({ error: 'Failed to save annotations' }, { status: 500 })
  }
}
