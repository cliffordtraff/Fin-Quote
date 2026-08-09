import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { Database } from '@/lib/database.types'
import { AdminAccessError, requireAdminUser } from '@/lib/auth/admin'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type Annotation = {
  question_id: number
  action:
    | 'fix_bug'
    | 'update_golden_test'
    | 'add_alias'
    | 'update_prompt'
    | 'skip'
    | ''
  comment: string
  updated_at: string
}

export type AnnotationsFile = {
  evaluation_file: string
  timestamp: string
  annotations: Annotation[]
}

type AnnotationRow =
  Database['public']['Tables']['evaluation_annotations']['Row']

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' }

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
  updated_at: z.string().datetime({ offset: true }),
})

const annotationsFileSchema = z
  .object({
    evaluation_file: evaluationFileSchema,
    timestamp: z.string().datetime({ offset: true }),
    // One compare-and-swap mutation per request keeps the write atomic and
    // lets two admins safely edit different questions from the same snapshot.
    annotations: z.array(annotationSchema).length(1),
  })
  .superRefine((value, context) => {
    const seen = new Set<number>()
    value.annotations.forEach((annotation, index) => {
      if (seen.has(annotation.question_id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Duplicate question annotation',
          path: ['annotations', index, 'question_id'],
        })
      }
      seen.add(annotation.question_id)
    })
  })

function adminErrorResponse(error: AdminAccessError): NextResponse {
  return NextResponse.json(
    { error: error.message },
    {
      status: error.message.includes('signed in') ? 401 : 403,
      headers: PRIVATE_HEADERS,
    },
  )
}

function annotationFromRow(row: AnnotationRow): Annotation {
  return {
    question_id: row.question_id,
    action: (row.action ?? '') as Annotation['action'],
    comment: row.comment ?? '',
    updated_at: row.updated_at,
  }
}

async function listAnnotationRows(
  evaluationFile: string,
): Promise<AnnotationRow[]> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('evaluation_annotations')
    .select('*')
    .eq('evaluation_file', evaluationFile)
    .order('question_id', { ascending: true })

  if (error) {
    throw new Error(`Failed to load annotations: ${error.message}`)
  }
  return (data ?? []) as AnnotationRow[]
}

function annotationsFile(
  evaluationFile: string,
  rows: AnnotationRow[],
): AnnotationsFile {
  const annotations = rows.map(annotationFromRow)
  return {
    evaluation_file: evaluationFile,
    timestamp:
      annotations.reduce<string | null>(
        (latest, annotation) =>
          !latest || annotation.updated_at > latest
            ? annotation.updated_at
            : latest,
        null,
      ) ?? new Date().toISOString(),
    annotations,
  }
}

async function annotationConflictResponse(
  evaluationFile: string,
): Promise<NextResponse> {
  const latestRows = await listAnnotationRows(evaluationFile)
  return NextResponse.json(
    {
      error: 'This annotation changed while you were editing it.',
      latest: annotationsFile(evaluationFile, latestRows),
    },
    { status: 409, headers: PRIVATE_HEADERS },
  )
}

// GET /api/annotations?file=eval-fast-2025-11-07.json
export async function GET(request: NextRequest) {
  try {
    await requireAdminUser()
    const evaluationFile = request.nextUrl.searchParams.get('file')
    if (!evaluationFile) {
      return NextResponse.json(
        { error: 'Missing file parameter' },
        { status: 400, headers: PRIVATE_HEADERS },
      )
    }

    const parsedFile = evaluationFileSchema.safeParse(evaluationFile)
    if (!parsedFile.success) {
      return NextResponse.json(
        { error: 'Invalid file parameter' },
        { status: 400, headers: PRIVATE_HEADERS },
      )
    }

    const rows = await listAnnotationRows(parsedFile.data)
    return NextResponse.json(annotationsFile(parsedFile.data, rows), {
      headers: PRIVATE_HEADERS,
    })
  } catch (error) {
    if (error instanceof AdminAccessError) return adminErrorResponse(error)
    console.error('Error reading annotations:', error)
    return NextResponse.json(
      { error: 'Failed to read annotations' },
      { status: 500, headers: PRIVATE_HEADERS },
    )
  }
}

// POST /api/annotations
//
// The client submits exactly one changed annotation. `updated_at` is the last
// server version the editor observed; browser wall-clock time is never used
// for conflict ordering. The changed row must match that exact database
// version, so independent question edits do not conflict or partially commit.
export async function POST(request: NextRequest) {
  try {
    await requireAdminUser()
    const parsedBody = annotationsFileSchema.safeParse(await request.json())
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: parsedBody.error.issues[0]?.message ?? 'Invalid annotations' },
        { status: 400, headers: PRIVATE_HEADERS },
      )
    }

    const body = parsedBody.data
    const existingRows = await listAnnotationRows(body.evaluation_file)
    const existingByQuestion = new Map(
      existingRows.map((row) => [row.question_id, row]),
    )
    const supabase = createServiceRoleClient()

    for (const annotation of body.annotations) {
      const existing = existingByQuestion.get(annotation.question_id)
      const values = {
        evaluation_file: body.evaluation_file,
        question_id: annotation.question_id,
        action: annotation.action || null,
        comment: annotation.comment || null,
      }

      if (!existing) {
        const { data, error } = await supabase
          .from('evaluation_annotations')
          .upsert(values, {
            onConflict: 'evaluation_file,question_id',
            ignoreDuplicates: true,
          })
          .select('id')
        if (error) {
          throw new Error(`Failed to create annotation: ${error.message}`)
        }
        if (!data || data.length !== 1) {
          return annotationConflictResponse(body.evaluation_file)
        }
        continue
      }

      if (
        (existing.action ?? '') === annotation.action &&
        (existing.comment ?? '') === annotation.comment
      ) {
        continue
      }
      if (annotation.updated_at !== existing.updated_at) {
        return annotationConflictResponse(body.evaluation_file)
      }

      const { data, error } = await supabase
        .from('evaluation_annotations')
        .update(values)
        .eq('id', existing.id)
        .eq('updated_at', existing.updated_at)
        .select('id')
      if (error) {
        throw new Error(`Failed to update annotation: ${error.message}`)
      }
      if (!data || data.length !== 1) {
        return annotationConflictResponse(body.evaluation_file)
      }
    }

    const latestRows = await listAnnotationRows(body.evaluation_file)
    return NextResponse.json(annotationsFile(body.evaluation_file, latestRows), {
      headers: PRIVATE_HEADERS,
    })
  } catch (error) {
    if (error instanceof AdminAccessError) return adminErrorResponse(error)
    console.error('Error saving annotations:', error)
    return NextResponse.json(
      { error: 'Failed to save annotations' },
      { status: 500, headers: PRIVATE_HEADERS },
    )
  }
}
