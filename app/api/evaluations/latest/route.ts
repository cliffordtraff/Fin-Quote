import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET() {
  try {
    const resultsDir = path.join(process.cwd(), 'test-data', 'test-results')

    // Ensure directory exists
    if (!fs.existsSync(resultsDir)) {
      return NextResponse.json(
        { error: 'Results directory not found', path: resultsDir },
        { status: 404 }
      )
    }

    // Get all JSON files (exclude annotation files)
    const files = fs.readdirSync(resultsDir).filter((f) => f.endsWith('.json') && !f.endsWith('-annotations.json'))

    if (files.length === 0) {
      return NextResponse.json({ error: 'No evaluation results found' }, { status: 404 })
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
    let evaluation: any
    try {
      evaluation = JSON.parse(fileContents)
    } catch (e) {
      return NextResponse.json(
        { error: 'Invalid evaluation JSON', filename: latestFile },
        { status: 500 }
      )
    }

    return NextResponse.json({
      filename: latestFile,
      evaluation,
    })
  } catch (error) {
    console.error('Error loading evaluation:', error)
    return NextResponse.json(
      { error: 'Failed to load evaluation' },
      { status: 500 }
    )
  }
}
