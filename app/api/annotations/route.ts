import { NextResponse, NextRequest } from 'next/server'
import fs from 'fs'
import path from 'path'

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

// GET /api/annotations?file=eval-fast-2025-11-07.json
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const evaluationFile = searchParams.get('file')

    if (!evaluationFile) {
      return NextResponse.json({ error: 'Missing file parameter' }, { status: 400 })
    }

    const annotationsPath = path.join(
      process.cwd(),
      'test-data',
      'test-results',
      evaluationFile.replace('.json', '-annotations.json')
    )

    // If annotations file doesn't exist, return empty
    if (!fs.existsSync(annotationsPath)) {
      return NextResponse.json({
        evaluation_file: evaluationFile,
        timestamp: new Date().toISOString(),
        annotations: [],
      })
    }

    const fileContents = fs.readFileSync(annotationsPath, 'utf-8')
    const annotations: AnnotationsFile = JSON.parse(fileContents)

    return NextResponse.json(annotations)
  } catch (error) {
    console.error('Error reading annotations:', error)
    return NextResponse.json({ error: 'Failed to read annotations' }, { status: 500 })
  }
}

// POST /api/annotations
export async function POST(request: NextRequest) {
  try {
    const body: AnnotationsFile = await request.json()

    const annotationsPath = path.join(
      process.cwd(),
      'test-data',
      'test-results',
      body.evaluation_file.replace('.json', '-annotations.json')
    )

    // Update timestamp
    body.timestamp = new Date().toISOString()

    // Write to file
    fs.writeFileSync(annotationsPath, JSON.stringify(body, null, 2))

    return NextResponse.json(body)
  } catch (error) {
    console.error('Error saving annotations:', error)
    return NextResponse.json({ error: 'Failed to save annotations' }, { status: 500 })
  }
}
