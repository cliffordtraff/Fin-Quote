import { NextRequest, NextResponse } from 'next/server'
import { searchSymbols } from '@/lib/symbol-resolver'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('q')

  if (!query || query.length < 1) {
    return NextResponse.json({ results: [] })
  }

  try {
    const results = await searchSymbols(query)
    return NextResponse.json({ results })
  } catch (error) {
    console.error('Error searching stocks:', error)
    return NextResponse.json(
      { error: 'Failed to search stocks' },
      { status: 500 }
    )
  }
}
