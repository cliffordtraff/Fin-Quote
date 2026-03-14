import { NextRequest, NextResponse } from 'next/server'
import { generateNewsletter } from '@/lib/newsletter/orchestrate'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const ticker = body?.ticker

    // Validate ticker format if provided (empty/missing triggers AI stock picker)
    if (ticker != null && typeof ticker === 'string' && ticker.trim() !== '') {
      const cleaned = ticker.toUpperCase().trim()
      if (!/^[A-Z]{1,5}$/.test(cleaned)) {
        return NextResponse.json(
          { error: `Invalid ticker format: "${ticker}"` },
          { status: 400 },
        )
      }
    }

    const cleanedTicker =
      ticker && typeof ticker === 'string' && ticker.trim() !== ''
        ? ticker.toUpperCase().trim()
        : undefined

    // Determine base URL from the request
    const proto = request.headers.get('x-forwarded-proto') ?? 'http'
    const host = request.headers.get('host') ?? 'localhost:3000'
    const baseUrl = `${proto}://${host}`

    const result = await generateNewsletter(cleanedTicker, { baseUrl })

    return NextResponse.json({
      ticker: result.ticker,
      generatedAt: result.generatedAt,
      autoPickedStock: result.autoPickedStock,
      stockPickerResult: result.stockPickerResult,
      selections: result.selections,
      chartPaths: result.chartPaths,
      htmlPath: result.htmlPath,
      previewPath: result.previewPath,
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
