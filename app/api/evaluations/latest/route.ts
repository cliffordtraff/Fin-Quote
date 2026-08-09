import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { AdminAccessError, requireAdminUser } from '@/lib/auth/admin'

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' }

function adminErrorResponse(error: AdminAccessError): NextResponse {
  return NextResponse.json(
    { error: error.message },
    {
      status: error.message.includes('signed in') ? 401 : 403,
      headers: PRIVATE_HEADERS,
    },
  )
}

export async function GET() {
  try {
    await requireAdminUser()
    const resultsDir = path.join(process.cwd(), 'test-data', 'test-results')

    // Ensure directory exists
    if (!fs.existsSync(resultsDir)) {
      return NextResponse.json(
        { error: 'Results directory not found' },
        { status: 404, headers: PRIVATE_HEADERS },
      )
    }

    // Get all JSON files (exclude annotation files)
    const files = fs
      .readdirSync(resultsDir)
      .filter(
        (file) =>
          file.endsWith('.json') && !file.endsWith('-annotations.json'),
      )

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No evaluation results found' },
        { status: 404, headers: PRIVATE_HEADERS },
      )
    }

    // Sort by modification time, get latest
    const latestFile = files
      .map((f) => ({
        name: f,
        time: fs.statSync(path.join(resultsDir, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.time - a.time)[0].name

    // Read the file
    const filePath = path.join(resultsDir, latestFile)
    const fileContents = fs.readFileSync(filePath, 'utf-8')
    let evaluation: unknown
    try {
      evaluation = JSON.parse(fileContents)
    } catch {
      return NextResponse.json(
        { error: 'Invalid evaluation JSON', filename: latestFile },
        { status: 500, headers: PRIVATE_HEADERS },
      )
    }

    return NextResponse.json(
      {
        filename: latestFile,
        evaluation,
      },
      { headers: PRIVATE_HEADERS },
    )
  } catch (error) {
    if (error instanceof AdminAccessError) return adminErrorResponse(error)
    console.error('Error loading evaluation:', error)
    return NextResponse.json(
      { error: 'Failed to load evaluation' },
      { status: 500, headers: PRIVATE_HEADERS },
    )
  }
}
