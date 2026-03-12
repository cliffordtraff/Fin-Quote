import { NextRequest, NextResponse } from 'next/server'
import { generateNewsletter } from '@/lib/newsletter/orchestrate'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const ticker = body?.ticker

    if (!ticker || typeof ticker !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid "ticker" in request body' },
        { status: 400 },
      )
    }

    const cleaned = ticker.toUpperCase().trim()
    if (!/^[A-Z]{1,5}$/.test(cleaned)) {
      return NextResponse.json(
        { error: `Invalid ticker format: "${ticker}"` },
        { status: 400 },
      )
    }

    // Determine base URL from the request
    const proto = request.headers.get('x-forwarded-proto') ?? 'http'
    const host = request.headers.get('host') ?? 'localhost:3000'
    const baseUrl = `${proto}://${host}`

    const result = await generateNewsletter(cleaned, { baseUrl })

    return NextResponse.json({
      ticker: result.ticker,
      generatedAt: result.generatedAt,
      selections: result.selections,
      chartPaths: result.chartPaths,
      htmlPath: result.htmlPath,
      timings: result.timings,
    })
  } catch (err) {
    console.error('Newsletter generation failed:', err)
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Newsletter generation failed',
      },
      { status: 500 },
    )
  }
}
